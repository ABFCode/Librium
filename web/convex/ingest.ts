import { action, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "convex/values";

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

export const insertSections = mutation({
  args: {
    bookId: v.id("books"),
    sections: v.array(sectionInsertSchema),
  },
  handler: async (ctx, args) => {
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

export const ingestParsedBook = action({
  args: {
    bookId: v.id("books"),
    sections: v.array(sectionSchema),
    chunks: v.array(chunkSchema),
    sectionBlocks: v.optional(v.array(sectionBlocksSchema)),
    images: v.optional(v.array(imageSchema)),
  },
  handler: async (ctx, args) => {
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
        contentStorageId = await ctx.storage.store(
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
      const storageId = await ctx.storage.store(
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

    for (const image of args.images ?? []) {
      if (!image?.href || !image?.data) {
        continue;
      }
      const existing = await ctx.db
        .query("bookAssets")
        .withIndex("by_book_href", (q) =>
          q.eq("bookId", args.bookId).eq("href", image.href)
        )
        .unique();
      if (existing) {
        continue;
      }
      const buffer = base64ToBytes(image.data);
      const storageId = await ctx.storage.store(
        new Blob([buffer], {
          type: image.contentType ?? "application/octet-stream",
        })
      );
      await ctx.db.insert("bookAssets", {
        bookId: args.bookId,
        href: image.href,
        storageId,
        contentType: image.contentType,
        byteSize: buffer.length,
        createdAt: Date.now(),
      });
    }
  },
});

const base64ToBytes = (data: string) => {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};
