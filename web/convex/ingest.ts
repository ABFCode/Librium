import { action, mutation } from "./_generated/server";
import { v } from "convex/values";

const sectionSchema = v.object({
  title: v.string(),
  orderIndex: v.number(),
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
    for (const section of args.sections) {
      await ctx.db.insert("sections", {
        bookId: args.bookId,
        title: section.title,
        orderIndex: section.orderIndex,
        depth: 0,
        textStorageId: section.textStorageId,
        textSize: section.textSize,
        createdAt: now,
      });
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
        });
        continue;
      }
      const storageId = await ctx.storage.store(
        new Blob([text], { type: "text/plain" })
      );
      sectionsToInsert.push({
        title: section.title,
        orderIndex: sectionIndex,
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
