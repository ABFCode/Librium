import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const upsertUserBook = mutation({
  args: {
    userId: v.id("users"),
    bookId: v.id("books"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userBooks")
      .withIndex("by_user_book", (q) =>
        q.eq("userId", args.userId).eq("bookId", args.bookId),
      )
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { updatedAt: now });
      return existing._id;
    }

    return await ctx.db.insert("userBooks", {
      userId: args.userId,
      bookId: args.bookId,
      lastChunkIndex: 0,
      lastChunkOffset: 0,
      updatedAt: now,
    });
  },
});
