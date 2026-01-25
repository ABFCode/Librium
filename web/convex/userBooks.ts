import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getViewerUserId,
  requireBookOwner,
  requireViewerUserId,
} from "./authHelpers";

export const upsertUserBook = mutation({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, args) => {
    const userId = await requireViewerUserId(ctx);
    await requireBookOwner(ctx, args.bookId);
    const existing = await ctx.db
      .query("userBooks")
      .withIndex("by_user_book", (q) =>
        q.eq("userId", userId).eq("bookId", args.bookId),
      )
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { updatedAt: now });
      return existing._id;
    }

    return await ctx.db.insert("userBooks", {
      userId,
      bookId: args.bookId,
      lastSectionIndex: 0,
      lastChunkIndex: 0,
      lastChunkOffset: 0,
      lastScrollRatio: 0,
      lastScrollTop: 0,
      lastScrollHeight: 0,
      lastClientHeight: 0,
      updatedAt: now,
    });
  },
});

export const getUserBook = query({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, args) => {
    const userId = await getViewerUserId(ctx);
    if (!userId) {
      return null;
    }
    await requireBookOwner(ctx, args.bookId);
    return await ctx.db
      .query("userBooks")
      .withIndex("by_user_book", (q) =>
        q.eq("userId", userId).eq("bookId", args.bookId),
      )
      .first();
  },
});

export const updateProgress = mutation({
  args: {
    bookId: v.id("books"),
    lastSectionId: v.optional(v.id("sections")),
    lastSectionIndex: v.optional(v.number()),
    lastChunkIndex: v.optional(v.number()),
    lastChunkOffset: v.optional(v.number()),
    lastScrollRatio: v.optional(v.number()),
    lastScrollTop: v.optional(v.number()),
    lastScrollHeight: v.optional(v.number()),
    lastClientHeight: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireViewerUserId(ctx);
    await requireBookOwner(ctx, args.bookId);
    const existing = await ctx.db
      .query("userBooks")
      .withIndex("by_user_book", (q) =>
        q.eq("userId", userId).eq("bookId", args.bookId),
      )
      .first();

    const now = Date.now();
    const patch = {
      lastSectionId: args.lastSectionId ?? existing?.lastSectionId ?? undefined,
      lastSectionIndex:
        args.lastSectionIndex ?? existing?.lastSectionIndex ?? 0,
      lastChunkIndex: args.lastChunkIndex ?? existing?.lastChunkIndex ?? 0,
      lastChunkOffset: args.lastChunkOffset ?? existing?.lastChunkOffset ?? 0,
      lastScrollRatio:
        args.lastScrollRatio ?? existing?.lastScrollRatio ?? 0,
      lastScrollTop: args.lastScrollTop ?? existing?.lastScrollTop ?? 0,
      lastScrollHeight:
        args.lastScrollHeight ?? existing?.lastScrollHeight ?? 0,
      lastClientHeight:
        args.lastClientHeight ?? existing?.lastClientHeight ?? 0,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("userBooks", {
      userId,
      bookId: args.bookId,
      ...patch,
    });
  },
});

export const listRecentByUser = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getViewerUserId(ctx);
    if (!userId) {
      return [];
    }
    const limit = args.limit ?? 8;
    const entries = await ctx.db
      .query("userBooks")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);

    const results = [];
    for (const entry of entries) {
      const book = await ctx.db.get(entry.bookId);
      if (book && book.ownerId === userId) {
        results.push({
          entryId: entry._id,
          book,
          lastSectionId: entry.lastSectionId,
          updatedAt: entry.updatedAt,
        });
      }
    }
    return results;
  },
});

export const listByUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getViewerUserId(ctx);
    if (!userId) {
      return [];
    }
    const entries = await ctx.db
      .query("userBooks")
      .withIndex("by_user_book", (q) => q.eq("userId", userId))
      .collect();

    const results = [];
    for (const entry of entries) {
      const book = await ctx.db.get(entry.bookId);
      if (!book || book.ownerId !== userId) {
        continue;
      }
      const totalSections = book.sectionCount ?? 0;
      const lastIndex = entry.lastSectionIndex ?? 0;
      const progress =
        totalSections > 0 ? (lastIndex + 1) / totalSections : 0;
      results.push({
        bookId: entry.bookId,
        lastSectionId: entry.lastSectionId,
        lastSectionTitle: null,
        lastSectionIndex: lastIndex,
        totalSections,
        progress,
        updatedAt: entry.updatedAt,
      });
    }
    return results;
  },
});
