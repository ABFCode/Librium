import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createBookFile = mutation({
  args: {
    bookId: v.id("books"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(),
    contentType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("bookFiles", {
      bookId: args.bookId,
      storageId: args.storageId,
      fileName: args.fileName,
      fileSize: args.fileSize,
      contentType: args.contentType,
      createdAt: now,
    });
  },
});

export const getByBook = query({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("bookFiles")
      .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
      .first();
  },
});
