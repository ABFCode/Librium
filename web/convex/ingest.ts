import { action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "convex/values";
import { requireBookOwner } from "./authHelpers";

const sectionSchema = v.object({
  title: v.string(),
  orderIndex: v.number(),
  depth: v.number(),
  parentOrderIndex: v.optional(v.number()),
  href: v.optional(v.string()),
  anchor: v.optional(v.string()),
});

const chunkSchema = v.object({
  sectionOrderIndex: v.number(),
  chunkIndex: v.number(),
  startOffset: v.number(),
  endOffset: v.number(),
  wordCount: v.number(),
  content: v.string(),
});

const inlineSchema = v.object({
  kind: v.string(),
  text: v.optional(v.string()),
  href: v.optional(v.string()),
  src: v.optional(v.string()),
  alt: v.optional(v.string()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  emph: v.optional(v.boolean()),
  strong: v.optional(v.boolean()),
});

const tableCellSchema = v.object({
  inlines: v.array(inlineSchema),
  header: v.optional(v.boolean()),
});

const tableSchema = v.object({
  rows: v.array(
    v.object({
      cells: v.array(tableCellSchema),
    })
  ),
});

const figureSchema = v.object({
  images: v.array(inlineSchema),
  caption: v.array(inlineSchema),
});

const blockSchema = v.object({
  kind: v.string(),
  level: v.optional(v.number()),
  ordered: v.optional(v.boolean()),
  listIndex: v.optional(v.number()),
  inlines: v.optional(v.array(inlineSchema)),
  table: v.optional(tableSchema),
  figure: v.optional(figureSchema),
  anchors: v.optional(v.array(v.string())),
});

const sectionBlocksSchema = v.object({
  sectionOrderIndex: v.number(),
  blocks: v.array(blockSchema),
});

const imageSchema = v.object({
  href: v.string(),
  contentType: v.optional(v.string()),
  data: v.string(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
});

const sectionInsertSchema = v.object({
  title: v.string(),
  orderIndex: v.number(),
  depth: v.number(),
  parentOrderIndex: v.optional(v.number()),
  href: v.optional(v.string()),
  anchor: v.optional(v.string()),
  textStorageId: v.optional(v.id("_storage")),
  textSize: v.optional(v.number()),
  contentStorageId: v.optional(v.id("_storage")),
  contentSize: v.optional(v.number()),
});

export const insertSections = internalMutation({
  args: {
    bookId: v.id("books"),
    sections: v.array(sectionInsertSchema),
  },
  handler: async (ctx, args) => {
    await requireBookOwner(ctx, args.bookId);
    const now = Date.now();
    const idByOrder = new Map<number, Id<"sections">>();
    for (const section of args.sections) {
      const parentId =
        section.parentOrderIndex !== undefined
          ? idByOrder.get(section.parentOrderIndex)
          : undefined;
      const id = await ctx.db.insert("sections", {
        bookId: args.bookId,
        parentId: parentId ?? undefined,
        title: section.title,
        orderIndex: section.orderIndex,
        depth: section.depth,
        href: section.href,
        anchor: section.anchor,
        textStorageId: section.textStorageId,
        textSize: section.textSize,
        contentStorageId: section.contentStorageId,
        contentSize: section.contentSize,
        createdAt: now,
      });
      idByOrder.set(section.orderIndex, id);
    }
  },
});

export const authorizeBookForIngest = internalQuery({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, args) => {
    await requireBookOwner(ctx, args.bookId);
    return true;
  },
});

export const listAssetHrefs = internalQuery({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, args) => {
    await requireBookOwner(ctx, args.bookId);
    const assets = await ctx.db
      .query("bookAssets")
      .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
      .collect();
    return assets.map((asset) => asset.href);
  },
});

export const upsertBookAssets = internalMutation({
  args: {
    bookId: v.id("books"),
    assets: v.array(
      v.object({
        href: v.string(),
        storageId: v.id("_storage"),
        contentType: v.optional(v.string()),
        byteSize: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireBookOwner(ctx, args.bookId);
    for (const asset of args.assets) {
      const existing = await ctx.db
        .query("bookAssets")
        .withIndex("by_book_href", (q) =>
          q.eq("bookId", args.bookId).eq("href", asset.href),
        )
        .unique();
      if (existing) {
        continue;
      }
      await ctx.db.insert("bookAssets", {
        bookId: args.bookId,
        href: asset.href,
        storageId: asset.storageId,
        contentType: asset.contentType,
        byteSize: asset.byteSize,
        createdAt: Date.now(),
      });
    }
  },
});

export const patchBookAfterIngest = internalMutation({
  args: {
    bookId: v.id("books"),
    sectionCount: v.number(),
  },
  handler: async (ctx, args) => {
    await requireBookOwner(ctx, args.bookId);
    await ctx.db.patch(args.bookId, {
      sectionCount: args.sectionCount,
      updatedAt: Date.now(),
    });
  },
});

export const ingestParsedBook = action({
  args: {
    bookId: v.id("books"),
    sections: v.array(sectionSchema),
    chunks: v.array(chunkSchema),
    sectionBlocks: v.optional(v.array(sectionBlocksSchema)),
    images: v.optional(v.array(imageSchema)),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery("ingest:authorizeBookForIngest", {
      bookId: args.bookId,
    });
    const sectionTexts = new Map<number, string[]>();
    const sectionBlocks = new Map<number, unknown[]>();

    for (const entry of args.sectionBlocks ?? []) {
      sectionBlocks.set(entry.sectionOrderIndex, entry.blocks);
    }

    for (const section of args.sections) {
      sectionTexts.set(section.orderIndex, []);
    }

    for (const chunk of args.chunks) {
      const list = sectionTexts.get(chunk.sectionOrderIndex);
      if (!list) {
        continue;
      }
      list.push(chunk.content);
    }

    const sectionsToInsert = [];
    for (const section of args.sections) {
      const sectionIndex = section.orderIndex;
      const parts = sectionTexts.get(sectionIndex) ?? [];
      const text = parts.join("\n\n");
      let contentStorageId: Id<"_storage"> | undefined;
      let contentSize: number | undefined;
      const blocks = sectionBlocks.get(sectionIndex) ?? [];
      if (blocks.length > 0) {
        const json = JSON.stringify(blocks);
        contentStorageId = await storeBlob(
          ctx,
          new Blob([json], { type: "application/json" })
        );
        contentSize = json.length;
      }
      if (text.length === 0) {
        sectionsToInsert.push({
          title: section.title,
          orderIndex: sectionIndex,
          depth: section.depth,
          parentOrderIndex: section.parentOrderIndex,
          href: section.href,
          anchor: section.anchor,
          contentStorageId,
          contentSize,
        });
        continue;
      }
      const storageId = await storeBlob(
        ctx,
        new Blob([text], { type: "text/plain" })
      );
      sectionsToInsert.push({
        title: section.title,
        orderIndex: sectionIndex,
        depth: section.depth,
        parentOrderIndex: section.parentOrderIndex,
        href: section.href,
        anchor: section.anchor,
        textStorageId: storageId,
        textSize: text.length,
        contentStorageId,
        contentSize,
      });
    }

    await ctx.runMutation("ingest:insertSections", {
      bookId: args.bookId,
      sections: sectionsToInsert,
    });

    await ctx.runMutation("ingest:patchBookAfterIngest", {
      bookId: args.bookId,
      sectionCount: args.sections.length,
    });

    const existingHrefs = new Set(
      await ctx.runQuery("ingest:listAssetHrefs", {
        bookId: args.bookId,
      }),
    );
    const assetsToInsert = [];
    for (const image of args.images ?? []) {
      if (!image?.href || !image?.data) {
        continue;
      }
      if (existingHrefs.has(image.href)) {
        continue;
      }
      const buffer = base64ToBytes(image.data);
      const storageId = await storeBlob(
        ctx,
        new Blob([buffer], {
          type: image.contentType ?? "application/octet-stream",
        })
      );
      assetsToInsert.push({
        href: image.href,
        storageId,
        contentType: image.contentType,
        byteSize: buffer.length,
      });
    }
    if (assetsToInsert.length > 0) {
      await ctx.runMutation("ingest:upsertBookAssets", {
        bookId: args.bookId,
        assets: assetsToInsert,
      });
    }
  },
});

const base64ToBytes = (data: string) => {
  if (typeof atob === "function") {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(data, "base64"));
  }
  throw new Error("Base64 decoding is not supported in this runtime.");
};

const storeBlob = async (
  ctx: Parameters<typeof ingestParsedBook.handler>[0],
  blob: Blob,
) => {
  if (typeof ctx.storage.store === "function") {
    return await ctx.storage.store(blob);
  }
  const uploadUrl = await ctx.runMutation("storage:generateUploadUrl", {});
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: blob.type ? { "Content-Type": blob.type } : undefined,
    body: blob,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.storageId) {
    throw new Error("Failed to upload blob to storage.");
  }
  return body.storageId as Id<"_storage">;
};
