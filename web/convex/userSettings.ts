import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getViewerUserId, requireViewerUserId } from "./authHelpers";

export const getByUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getViewerUserId(ctx);
    if (!userId) {
      return null;
    }
    return await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

export const upsert = mutation({
  args: {
    fontScale: v.number(),
    lineHeight: v.number(),
    contentWidth: v.number(),
    theme: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireViewerUserId(ctx);
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const now = Date.now();
    const payload = {
      userId,
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
