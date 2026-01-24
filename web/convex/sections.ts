import { query } from "./_generated/server";
import { v } from "convex/values";

export const listSections = query({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sections")
      .withIndex("by_book_order", (q) => q.eq("bookId", args.bookId))
      .collect();
  },
});
