import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listByUserBook = query({
  args: {
    userId: v.id("users"),
    bookId: v.id("books"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("bookmarks")
      .withIndex("by_user_book", (q) =>
        q.eq("userId", args.userId).eq("bookId", args.bookId),
      )
      .collect();
  },
});

export const createBookmark = mutation({
  args: {
    userId: v.id("users"),
    bookId: v.id("books"),
    sectionId: v.id("sections"),
    chunkIndex: v.number(),
    offset: v.number(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("bookmarks", {
      userId: args.userId,
      bookId: args.bookId,
      sectionId: args.sectionId,
      chunkIndex: args.chunkIndex,
      offset: args.offset,
      label: args.label,
      createdAt: now,
    });
  },
});

export const deleteBookmark = mutation({
  args: {
    bookmarkId: v.id("bookmarks"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const bookmark = await ctx.db.get(args.bookmarkId);
    if (!bookmark) {
      return;
    }
    if (bookmark.userId !== args.userId) {
      throw new Error("Not authorized to delete this bookmark.");
    }
    await ctx.db.delete(args.bookmarkId);
  },
});
