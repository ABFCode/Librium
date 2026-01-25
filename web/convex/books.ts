import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createBook = mutation({
  args: {
    ownerId: v.id("users"),
    title: v.string(),
    author: v.optional(v.string()),
    language: v.optional(v.string()),
    publisher: v.optional(v.string()),
    publishedAt: v.optional(v.string()),
    series: v.optional(v.string()),
    seriesIndex: v.optional(v.string()),
    subjects: v.optional(v.array(v.string())),
    identifiers: v.optional(
      v.array(
        v.object({
          id: v.string(),
          scheme: v.string(),
          value: v.string(),
          type: v.string(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("books", {
      ownerId: args.ownerId,
      title: args.title,
      author: args.author,
      language: args.language,
      publisher: args.publisher,
      publishedAt: args.publishedAt,
      series: args.series,
      seriesIndex: args.seriesIndex,
      subjects: args.subjects,
      identifiers: args.identifiers,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listByOwner = query({
  args: {
    ownerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("books")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .order("desc")
      .collect();
  },
});

export const deleteBook = mutation({
  args: {
    userId: v.id("users"),
    bookId: v.id("books"),
  },
  handler: async (ctx, args) => {
    const book = await ctx.db.get(args.bookId);
    if (!book) {
      return;
    }
    if (book.ownerId !== args.userId) {
      throw new Error("Not authorized to delete this book.");
    }

    const sections = await ctx.db
      .query("sections")
      .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
      .collect();
    for (const section of sections) {
      if (section.textStorageId) {
        await ctx.storage.delete(section.textStorageId);
      }
      await ctx.db.delete(section._id);
    }

    const files = await ctx.db
      .query("bookFiles")
      .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
      .collect();
    for (const file of files) {
      await ctx.storage.delete(file.storageId);
      await ctx.db.delete(file._id);
    }

    const userBooks = await ctx.db
      .query("userBooks")
      .withIndex("by_user_book", (q) =>
        q.eq("userId", args.userId).eq("bookId", args.bookId),
      )
      .collect();
    for (const entry of userBooks) {
      await ctx.db.delete(entry._id);
    }

    await ctx.db.delete(args.bookId);
  },
});
