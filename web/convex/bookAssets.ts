import { query } from "./_generated/server";
import { v } from "convex/values";

export const getUrlsByBook = query({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, args) => {
    const assets = await ctx.db
      .query("bookAssets")
      .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
      .collect();
    const result: Record<string, string> = {};
    for (const asset of assets) {
      const url = await ctx.storage.getUrl(asset.storageId);
      if (url) {
        result[asset.href] = url;
      }
    }
    return result;
  },
});
