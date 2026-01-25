import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getViewerUserId,
  requireBookOwner,
  requireViewerUserId,
} from "./authHelpers";

export const createBook = mutation({
  args: {
    title: v.string(),
    author: v.optional(v.string()),
    language: v.optional(v.string()),
    publisher: v.optional(v.string()),
    publishedAt: v.optional(v.string()),
    series: v.optional(v.string()),
    seriesIndex: v.optional(v.string()),
    subjects: v.optional(v.array(v.string())),
    coverStorageId: v.optional(v.id("_storage")),
    coverContentType: v.optional(v.string()),
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
    const ownerId = await requireViewerUserId(ctx);
    const now = Date.now();
    return await ctx.db.insert("books", {
      ownerId,
      title: args.title,
      author: args.author,
      language: args.language,
      publisher: args.publisher,
      publishedAt: args.publishedAt,
      series: args.series,
      seriesIndex: args.seriesIndex,
      subjects: args.subjects,
      coverStorageId: args.coverStorageId,
      coverContentType: args.coverContentType,
      identifiers: args.identifiers,
      sectionCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listByOwner = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getViewerUserId(ctx);
    if (!ownerId) {
      return [];
    }
    return await ctx.db
      .query("books")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect();
  },
});

export const deleteBook = mutation({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, args) => {
    const { viewerId, book } = await requireBookOwner(ctx, args.bookId);

    const sections = await ctx.db
      .query("sections")
      .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
      .collect();
    for (const section of sections) {
      if (section.textStorageId) {
        await ctx.storage.delete(section.textStorageId);
      }
      if (section.contentStorageId) {
        await ctx.storage.delete(section.contentStorageId);
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
        q.eq("userId", viewerId).eq("bookId", args.bookId),
      )
      .collect();
    for (const entry of userBooks) {
      await ctx.db.delete(entry._id);
    }

    const bookmarks = await ctx.db
      .query("bookmarks")
      .withIndex("by_user_book", (q) =>
        q.eq("userId", viewerId).eq("bookId", args.bookId),
      )
      .collect();
    for (const bookmark of bookmarks) {
      await ctx.db.delete(bookmark._id);
    }

    const assets = await ctx.db
      .query("bookAssets")
      .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
      .collect();
    for (const asset of assets) {
      await ctx.storage.delete(asset.storageId);
      await ctx.db.delete(asset._id);
    }

    if (book.coverStorageId) {
      await ctx.storage.delete(book.coverStorageId);
    }

    await ctx.db.delete(args.bookId);
  },
});

export const getCoverUrls = query({
  args: {
    bookIds: v.array(v.id("books")),
  },
  handler: async (ctx, args) => {
    const viewerId = await getViewerUserId(ctx);
    if (!viewerId) {
      return {};
    }
    const result: Record<string, string | null> = {};
    for (const bookId of args.bookIds) {
      const book = await ctx.db.get(bookId);
      if (!book || book.ownerId !== viewerId) {
        result[bookId] = null;
        continue;
      }
      if (!book.coverStorageId) {
        result[bookId] = null;
        continue;
      }
      result[bookId] = await ctx.storage.getUrl(book.coverStorageId);
    }
    return result;
  },
});
