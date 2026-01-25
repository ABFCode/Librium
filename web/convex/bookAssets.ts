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
    let assets = [];
    if (args.hrefs && args.hrefs.length > 0) {
      const items = await Promise.all(
        args.hrefs.map((href) =>
          ctx.db
            .query("bookAssets")
            .withIndex("by_book_href", (q) =>
              q.eq("bookId", args.bookId).eq("href", href),
            )
            .first(),
        ),
      );
      assets = items.filter(Boolean);
    } else {
      assets = await ctx.db
        .query("bookAssets")
        .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
        .collect();
    }
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
