import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getViewerUserId,
  requireBookOwner,
  requireSectionOwner,
  requireViewerUserId,
} from "./authHelpers";

export const listByUserBook = query({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, args) => {
    const userId = await getViewerUserId(ctx);
    if (!userId) {
      return [];
    }
    await requireBookOwner(ctx, args.bookId);
    return await ctx.db
      .query("bookmarks")
      .withIndex("by_user_book", (q) =>
        q.eq("userId", userId).eq("bookId", args.bookId),
      )
      .collect();
  },
});

export const createBookmark = mutation({
  args: {
    bookId: v.id("books"),
    sectionId: v.id("sections"),
    chunkIndex: v.number(),
    offset: v.number(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireViewerUserId(ctx);
    await requireBookOwner(ctx, args.bookId);
    const { section } = await requireSectionOwner(ctx, args.sectionId);
    if (section.bookId !== args.bookId) {
      throw new Error("Section does not belong to this book.");
    }
    const now = Date.now();
    return await ctx.db.insert("bookmarks", {
      userId,
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
  },
  handler: async (ctx, args) => {
    const userId = await requireViewerUserId(ctx);
    const bookmark = await ctx.db.get(args.bookmarkId);
    if (!bookmark) {
      return;
    }
    if (bookmark.userId !== userId) {
      throw new Error("Not authorized to delete this bookmark.");
    }
    await ctx.db.delete(args.bookmarkId);
  },
});
