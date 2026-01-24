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
