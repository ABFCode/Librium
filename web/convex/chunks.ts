import { query } from "./_generated/server";
import { v } from "convex/values";

export const listChunksBySection = query({
  args: {
    sectionId: v.id("sections"),
    startIndex: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contentChunks")
      .withIndex("by_section_index", (q) =>
        q.eq("sectionId", args.sectionId).gte("chunkIndex", args.startIndex),
      )
      .take(args.limit);
  },
});
