import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  getViewerUserId,
  requireSectionOwner,
} from "./authHelpers";

export const listSections = query({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, args) => {
    const viewerId = await getViewerUserId(ctx);
    if (!viewerId) {
      return [];
    }
    const book = await ctx.db.get(args.bookId);
    if (!book || book.ownerId !== viewerId) {
      return [];
    }
    return await ctx.db
      .query("sections")
      .withIndex("by_book_order", (q) => q.eq("bookId", args.bookId))
      .collect();
  },
});

export const getSection = query({
  args: {
    sectionId: v.id("sections"),
  },
  handler: async (ctx, args) => {
    const viewerId = await getViewerUserId(ctx);
    if (!viewerId) {
      return null;
    }
    const { section } = await requireSectionOwner(ctx, args.sectionId);
    return section;
  },
});
