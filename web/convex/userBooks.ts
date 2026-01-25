import { mutation, query } from "./_generated/server";
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

export const getUserBook = query({
  args: {
    userId: v.id("users"),
    bookId: v.id("books"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userBooks")
      .withIndex("by_user_book", (q) =>
        q.eq("userId", args.userId).eq("bookId", args.bookId),
      )
      .first();
  },
});

export const updateProgress = mutation({
  args: {
    userId: v.id("users"),
    bookId: v.id("books"),
    lastSectionId: v.optional(v.id("sections")),
    lastChunkIndex: v.optional(v.number()),
    lastChunkOffset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userBooks")
      .withIndex("by_user_book", (q) =>
        q.eq("userId", args.userId).eq("bookId", args.bookId),
      )
      .first();

    const now = Date.now();
    const patch = {
      lastSectionId: args.lastSectionId ?? existing?.lastSectionId ?? undefined,
      lastChunkIndex: args.lastChunkIndex ?? existing?.lastChunkIndex ?? 0,
      lastChunkOffset: args.lastChunkOffset ?? existing?.lastChunkOffset ?? 0,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("userBooks", {
      userId: args.userId,
      bookId: args.bookId,
      ...patch,
    });
  },
});

export const listRecentByUser = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 8;
    const entries = await ctx.db
      .query("userBooks")
      .withIndex("by_user_updated", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);

    const results = [];
    for (const entry of entries) {
      const book = await ctx.db.get(entry.bookId);
      if (book) {
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
