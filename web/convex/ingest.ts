import { action, internalMutation, internalQuery, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireViewerUserId, requireBookOwner } from "./authHelpers";

const metadataSchema = v.object({
  title: v.string(),
  author: v.optional(v.string()),
  language: v.optional(v.string()),
  publisher: v.optional(v.string()),
  publishedAt: v.optional(v.string()),
  series: v.optional(v.string()),
  seriesIndex: v.optional(v.string()),
  subjects: v.optional(v.array(v.string())),
  identifiers: v.optional(
    v.array(
      v.object({ id: v.string(), scheme: v.string(), value: v.string(), type: v.string() }),
    ),
  ),
});

/**
 * Create the import job + book + file + userBook + image assets in one mutation.
 * All heavy blobs (raw EPUB, cover, images) are uploaded by the client via upload
 * URLs first; only their storage ids flow through here.
 */
export const startImport = mutation({
  args: {
    fileName: v.string(),
    fileSize: v.number(),
    contentType: v.optional(v.string()),
    rawStorageId: v.id("_storage"),
    metadata: metadataSchema,
    coverStorageId: v.optional(v.id("_storage")),
    coverContentType: v.optional(v.string()),
    images: v.optional(
      v.array(
        v.object({
          href: v.string(),
          storageId: v.id("_storage"),
          contentType: v.optional(v.string()),
          byteSize: v.optional(v.number()),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireViewerUserId(ctx);
    const now = Date.now();
    const m = args.metadata;

    const importJobId = await ctx.db.insert("importJobs", {
      userId,
      fileName: args.fileName,
      fileSize: args.fileSize,
      contentType: args.contentType,
      storageId: args.rawStorageId,
      status: "ingesting",
      createdAt: now,
      startedAt: now,
    });

    const bookId = await ctx.db.insert("books", {
      ownerId: userId,
      title: m.title || args.fileName.replace(/\.epub$/i, ""),
      author: m.author,
      language: m.language,
      publisher: m.publisher,
      publishedAt: m.publishedAt,
      series: m.series,
      seriesIndex: m.seriesIndex,
      subjects: m.subjects,
      coverStorageId: args.coverStorageId,
      coverContentType: args.coverContentType,
      identifiers: m.identifiers,
      sectionCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("bookFiles", {
      bookId,
      storageId: args.rawStorageId,
      fileName: args.fileName,
      fileSize: args.fileSize,
      contentType: args.contentType,
      createdAt: now,
    });

    await ctx.db.insert("userBooks", {
      userId,
      bookId,
      lastSectionIndex: 0,
      updatedAt: now,
    });

    for (const img of args.images ?? []) {
      await ctx.db.insert("bookAssets", {
        bookId,
        href: img.href,
        storageId: img.storageId,
        contentType: img.contentType,
        byteSize: img.byteSize,
        createdAt: now,
      });
    }

    await ctx.db.patch(importJobId, { bookId });
    return { bookId, importJobId };
  },
});

export const authorizeBook = internalQuery({
  args: { bookId: v.id("books") },
  handler: async (ctx, args) => {
    await requireBookOwner(ctx, args.bookId);
    return true;
  },
});

export const insertSections = internalMutation({
  args: {
    bookId: v.id("books"),
    sections: v.array(
      v.object({
        title: v.string(),
        orderIndex: v.number(),
        depth: v.number(),
        href: v.optional(v.string()),
        anchor: v.optional(v.string()),
        contentStorageId: v.optional(v.id("_storage")),
        contentSize: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireBookOwner(ctx, args.bookId);
    const now = Date.now();
    for (const s of args.sections) {
      await ctx.db.insert("sections", {
        bookId: args.bookId,
        title: s.title,
        orderIndex: s.orderIndex,
        depth: s.depth,
        href: s.href,
        anchor: s.anchor,
        contentStorageId: s.contentStorageId,
        contentSize: s.contentSize,
        createdAt: now,
      });
    }
  },
});

/**
 * Ingest one batch of sections: store each section's blocks JSON as a blob, then
 * insert the section rows. Called repeatedly by the client with small batches, so
 * no book-sized payload ever passes through a single function (avoids the 64 MB cap).
 */
export const ingestSectionsBatch = action({
  args: {
    bookId: v.id("books"),
    sections: v.array(
      v.object({
        title: v.string(),
        orderIndex: v.number(),
        depth: v.number(),
        href: v.optional(v.string()),
        anchor: v.optional(v.string()),
        blocksJson: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.runQuery(internal.ingest.authorizeBook, { bookId: args.bookId });
    const rows: Array<{
      title: string;
      orderIndex: number;
      depth: number;
      href?: string;
      anchor?: string;
      contentStorageId?: string;
      contentSize?: number;
    }> = [];
    for (const s of args.sections) {
      let contentStorageId: string | undefined;
      let contentSize: number | undefined;
      if (s.blocksJson && s.blocksJson !== "[]") {
        const blob = new Blob([s.blocksJson], { type: "application/json" });
        contentStorageId = await ctx.storage.store(blob);
        contentSize = s.blocksJson.length;
      }
      rows.push({
        title: s.title,
        orderIndex: s.orderIndex,
        depth: s.depth,
        href: s.href,
        anchor: s.anchor,
        contentStorageId,
        contentSize,
      });
    }
    await ctx.runMutation(internal.ingest.insertSections, { bookId: args.bookId, sections: rows });
  },
});

export const finalizeImport = mutation({
  args: {
    bookId: v.id("books"),
    sectionCount: v.number(),
    importJobId: v.id("importJobs"),
  },
  handler: async (ctx, args) => {
    await requireBookOwner(ctx, args.bookId);
    await ctx.db.patch(args.bookId, { sectionCount: args.sectionCount, updatedAt: Date.now() });
    await ctx.db.patch(args.importJobId, { status: "completed", finishedAt: Date.now() });
  },
});

export const failImport = mutation({
  args: { importJobId: v.id("importJobs"), errorMessage: v.string() },
  handler: async (ctx, args) => {
    await requireViewerUserId(ctx);
    const job = await ctx.db.get(args.importJobId);
    if (!job) return;
    await ctx.db.patch(args.importJobId, {
      status: "failed",
      errorMessage: args.errorMessage,
      finishedAt: Date.now(),
    });
  },
});
