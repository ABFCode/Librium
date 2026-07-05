import { action, internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getViewerUserId, requireBookOwner, requireViewerUserId } from "./authHelpers";
import { r2 } from "./r2";

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
 * Register an imported book (metadata only — the client has already parsed it
 * locally). Blob uploads to R2 happen after this and land via attachFiles, so
 * the book is readable on the importing device before any upload completes.
 */
export const registerImport = mutation({
  args: {
    fileName: v.string(),
    fileSize: v.number(),
    sectionCount: v.number(),
    metadata: metadataSchema,
  },
  handler: async (ctx, args) => {
    const userId = await requireViewerUserId(ctx);
    const now = Date.now();
    const m = args.metadata;
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
      identifiers: m.identifiers,
      sectionCount: args.sectionCount,
      fileName: args.fileName,
      fileSize: args.fileSize,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("userBooks", {
      userId,
      bookId,
      lastSectionIndex: 0,
      updatedAt: now,
    });
    return bookId;
  },
});

/** Attach the R2 object keys once the client uploads complete. */
export const attachFiles = mutation({
  args: {
    bookId: v.id("books"),
    epubKey: v.optional(v.string()),
    coverKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBookOwner(ctx, args.bookId);
    await ctx.db.patch(args.bookId, {
      ...(args.epubKey ? { epubKey: args.epubKey } : {}),
      ...(args.coverKey ? { coverKey: args.coverKey } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const listByOwner = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getViewerUserId(ctx);
    if (!ownerId) {
      return [];
    }
    return await ctx.db
      .query("books")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect();
  },
});

// Graceful single-book lookup: null when missing or not owned — never throws.
// Clients use null as the definitive "deleted elsewhere" signal.
export const getBook = query({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, args) => {
    const viewerId = await getViewerUserId(ctx);
    if (!viewerId) {
      return null;
    }
    const book = await ctx.db.get(args.bookId);
    if (!book || book.ownerId !== viewerId) {
      return null;
    }
    return book;
  },
});

/**
 * Signed R2 URL for the raw EPUB — device seeding (download → re-parse →
 * IndexedDB) and the library download button.
 */
export const getEpubUrl = query({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, args) => {
    const viewerId = await getViewerUserId(ctx);
    if (!viewerId) {
      return null;
    }
    const book = await ctx.db.get(args.bookId);
    if (!book || book.ownerId !== viewerId || !book.epubKey) {
      return null;
    }
    return await r2.getUrl(book.epubKey, { expiresIn: 60 * 60 });
  },
});

export const getCoverUrls = query({
  args: {
    bookIds: v.array(v.id("books")),
  },
  handler: async (ctx, args) => {
    const viewerId = await getViewerUserId(ctx);
    if (!viewerId) {
      return {};
    }
    const result: Record<string, string> = {};
    for (const bookId of args.bookIds) {
      const book = await ctx.db.get(bookId);
      if (!book || book.ownerId !== viewerId || !book.coverKey) {
        continue;
      }
      result[bookId] = await r2.getUrl(book.coverKey, { expiresIn: 60 * 60 });
    }
    return result;
  },
});

export const deleteBookData = internalMutation({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, args) => {
    const { book } = await requireBookOwner(ctx, args.bookId);
    const userBooks = await ctx.db
      .query("userBooks")
      .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
      .collect();
    for (const entry of userBooks) {
      await ctx.db.delete(entry._id);
    }
    const bookmarks = await ctx.db
      .query("bookmarks")
      .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
      .collect();
    for (const bookmark of bookmarks) {
      await ctx.db.delete(bookmark._id);
    }
    await ctx.db.delete(args.bookId);
    return { epubKey: book.epubKey, coverKey: book.coverKey };
  },
});

/**
 * Delete a book: rows in one mutation (content tables no longer exist, so no
 * batching needed), then the R2 objects.
 */
export const deleteBook = action({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, args) => {
    const { epubKey, coverKey } = await ctx.runMutation(
      internal.books.deleteBookData,
      { bookId: args.bookId },
    );
    if (epubKey) {
      await r2.deleteObject(ctx, epubKey);
    }
    if (coverKey) {
      await r2.deleteObject(ctx, coverKey);
    }
  },
});
