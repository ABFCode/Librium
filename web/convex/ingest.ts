import { mutation } from "./_generated/server";
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

export const ingestParsedBook = mutation({
  args: {
    bookId: v.id("books"),
    sections: v.array(sectionSchema),
    chunks: v.array(chunkSchema),
  },
  handler: async (ctx, args) => {
    const sectionIdMap = new Map<number, string>();
    const now = Date.now();

    for (const section of args.sections) {
      const sectionId = await ctx.db.insert("sections", {
        bookId: args.bookId,
        title: section.title,
        orderIndex: section.orderIndex,
        depth: 0,
        createdAt: now,
      });
      sectionIdMap.set(section.orderIndex, sectionId);
    }

    for (const chunk of args.chunks) {
      const sectionId = sectionIdMap.get(chunk.sectionOrderIndex);
      if (!sectionId) {
        continue;
      }
      await ctx.db.insert("contentChunks", {
        bookId: args.bookId,
        sectionId,
        chunkIndex: chunk.chunkIndex,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        wordCount: chunk.wordCount,
        content: chunk.content,
        createdAt: now,
      });
    }
  },
});
