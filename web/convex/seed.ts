import { action } from "./_generated/server";
import { v } from "convex/values";

export const seedBookContent = action({
  args: {
    bookId: v.id("books"),
    sectionCount: v.optional(v.number()),
    chunksPerSection: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sectionCount = args.sectionCount ?? 3;
    const chunksPerSection = args.chunksPerSection ?? 40;
    const sectionsToInsert = [];

    for (let s = 0; s < sectionCount; s += 1) {
      const paragraphs = [];
      for (let c = 0; c < chunksPerSection; c += 1) {
        paragraphs.push(
          `Section ${s + 1} — paragraph ${
            c + 1
          } placeholder content for reader testing.`,
        );
      }
      const text = paragraphs.join("\n\n");
      const storageId = await ctx.storage.store(
        new Blob([text], { type: "text/plain" }),
      );
      sectionsToInsert.push({
        title: `Section ${s + 1}`,
        orderIndex: s,
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
