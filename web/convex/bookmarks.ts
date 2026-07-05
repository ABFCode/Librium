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
    // Graceful when the book was deleted — see userBooks.getUserBook.
    const book = await ctx.db.get(args.bookId);
    if (!book || book.ownerId !== userId) {
      return [];
    }
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
    sectionIndex: v.optional(v.number()),
    blockIndex: v.number(),
    offset: v.number(),
    label: v.optional(v.string()),
    // Client-generated key: retried offline pushes create exactly one row.
    clientKey: v.optional(v.string()),
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireViewerUserId(ctx);
    await requireBookOwner(ctx, args.bookId);
    const { section } = await requireSectionOwner(ctx, args.sectionId);
    if (section.bookId !== args.bookId) {
      throw new Error("Section does not belong to this book.");
    }
    const now = Date.now();
    if (args.clientKey) {
      const existing = await ctx.db
        .query("bookmarks")
        .withIndex("by_user_book", (q) =>
          q.eq("userId", userId).eq("bookId", args.bookId),
        )
        .collect();
      const match = existing.find((b) => b.clientKey === args.clientKey);
      if (match) {
        return match._id;
      }
    }
    return await ctx.db.insert("bookmarks", {
      userId,
      bookId: args.bookId,
      sectionId: args.sectionId,
      sectionIndex: args.sectionIndex,
      blockIndex: args.blockIndex,
      offset: args.offset,
      label: args.label,
      createdAt: args.createdAt ?? now,
      clientKey: args.clientKey,
      updatedAt: now,
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
    // Tombstone, not a hard delete — other devices' local copies purge on
    // their next merge instead of resurrecting the bookmark.
    await ctx.db.patch(args.bookmarkId, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
