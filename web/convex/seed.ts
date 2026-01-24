import { mutation } from "./_generated/server";
import { v } from "convex/values";

const countWords = (text: string) =>
  text.trim().split(/\s+/).filter(Boolean).length;

export const seedBookContent = mutation({
  args: {
    bookId: v.id("books"),
    sectionCount: v.optional(v.number()),
    chunksPerSection: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sectionCount = args.sectionCount ?? 3;
    const chunksPerSection = args.chunksPerSection ?? 40;
    let globalOffset = 0;

    for (let s = 0; s < sectionCount; s += 1) {
      const sectionId = await ctx.db.insert("sections", {
        bookId: args.bookId,
        title: `Section ${s + 1}`,
        orderIndex: s,
        depth: 0,
        createdAt: Date.now(),
      });

      for (let c = 0; c < chunksPerSection; c += 1) {
        const content = `Section ${s + 1} — chunk ${
          c + 1
        } placeholder content for reader testing.`;
        const startOffset = globalOffset;
        const endOffset = startOffset + content.length;
        globalOffset = endOffset + 1;

        await ctx.db.insert("contentChunks", {
          bookId: args.bookId,
          sectionId,
          chunkIndex: c,
          startOffset,
          endOffset,
          wordCount: countWords(content),
          content,
          createdAt: Date.now(),
        });
      }
    }
  },
});
