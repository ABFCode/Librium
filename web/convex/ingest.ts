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

const sectionInsertSchema = v.object({
  title: v.string(),
  orderIndex: v.number(),
  depth: v.number(),
  parentOrderIndex: v.optional(v.number()),
  href: v.optional(v.string()),
  anchor: v.optional(v.string()),
  textStorageId: v.optional(v.id("_storage")),
  textSize: v.optional(v.number()),
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
  },
  handler: async (ctx, args) => {
    const sectionTexts = new Map<number, string[]>();

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
      if (text.length === 0) {
        sectionsToInsert.push({
          title: section.title,
          orderIndex: sectionIndex,
          depth: section.depth,
          parentOrderIndex: section.parentOrderIndex,
          href: section.href,
          anchor: section.anchor,
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
      });
    }

    await ctx.runMutation("ingest:insertSections", {
      bookId: args.bookId,
      sections: sectionsToInsert,
    });
  },
});
