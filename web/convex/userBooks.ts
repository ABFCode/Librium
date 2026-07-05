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
    // Graceful when the book was deleted (possibly from another device) —
    // a live reader subscription must not explode into an error page.
    const book = await ctx.db.get(args.bookId);
    if (!book || book.ownerId !== userId) {
      return null;
    }
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
    lastBlockIndex: v.optional(v.number()),
    lastBlockOffset: v.optional(v.number()),
    // Client edit time — lets a reconnecting device push offline progress
    // without a stale queued write clobbering newer progress from elsewhere.
    editedAt: v.optional(v.number()),
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

    // LWW: reject writes older than what is already recorded.
    if (
      existing?.progressEditedAt !== undefined &&
      args.editedAt !== undefined &&
      args.editedAt < existing.progressEditedAt
    ) {
      return existing._id;
    }

    const now = Date.now();
    const patch = {
      lastSectionId: args.lastSectionId ?? existing?.lastSectionId ?? undefined,
      lastSectionIndex: args.lastSectionIndex ?? existing?.lastSectionIndex ?? 0,
      lastBlockIndex: args.lastBlockIndex ?? existing?.lastBlockIndex ?? undefined,
      lastBlockOffset: args.lastBlockOffset ?? existing?.lastBlockOffset ?? undefined,
      updatedAt: now,
      progressEditedAt: args.editedAt ?? now,
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
      const progress = totalSections > 0 ? (lastIndex + 1) / totalSections : 0;
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
