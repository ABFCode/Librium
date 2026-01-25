import { query } from "./_generated/server";
import { v } from "convex/values";
import { getViewerUserId } from "./authHelpers";

export const getUrlsByBook = query({
  args: {
    bookId: v.id("books"),
    hrefs: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const viewerId = await getViewerUserId(ctx);
    if (!viewerId) {
      return {};
    }
    const book = await ctx.db.get(args.bookId);
    if (!book || book.ownerId !== viewerId) {
      return {};
    }
    const assets = await ctx.db
      .query("bookAssets")
      .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
      .collect();
    const hrefFilter =
      args.hrefs && args.hrefs.length > 0
        ? new Set(args.hrefs)
        : null;
    const result: Record<string, string> = {};
    for (const asset of assets) {
      if (hrefFilter && !hrefFilter.has(asset.href)) {
        continue;
      }
      const url = await ctx.storage.getUrl(asset.storageId);
      if (url) {
        result[asset.href] = url;
      }
    }
    return result;
  },
});
