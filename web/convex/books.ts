import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createBook = mutation({
  args: {
    ownerId: v.id("users"),
    title: v.string(),
    author: v.optional(v.string()),
    language: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("books", {
      ownerId: args.ownerId,
      title: args.title,
      author: args.author,
      language: args.language,
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
