import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getByUser = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

export const upsert = mutation({
  args: {
    userId: v.id("users"),
    fontScale: v.number(),
    lineHeight: v.number(),
    contentWidth: v.number(),
    theme: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const now = Date.now();
    const payload = {
      userId: args.userId,
      fontScale: args.fontScale,
      lineHeight: args.lineHeight,
      contentWidth: args.contentWidth,
      theme: args.theme,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("userSettings", payload);
  },
});
