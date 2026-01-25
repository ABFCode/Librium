import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getViewerUserId,
  requireBookOwner,
  requireBookOwnerOrImporter,
} from "./authHelpers";

export const createBookFile = mutation({
  args: {
    bookId: v.id("books"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(),
    contentType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBookOwnerOrImporter(ctx, args.bookId);
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
    const viewerId = await getViewerUserId(ctx);
    if (!viewerId) {
      return null;
    }
    const book = await ctx.db.get(args.bookId);
    if (!book || book.ownerId !== viewerId) {
      return null;
    }
    return await ctx.db
      .query("bookFiles")
      .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
      .first();
  },
});

export const getDownloadUrl = mutation({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, args) => {
    await requireBookOwner(ctx, args.bookId);
    const file = await ctx.db
      .query("bookFiles")
      .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
      .first();
    if (!file) {
      return null;
    }
    return await ctx.storage.getUrl(file.storageId);
  },
});
