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
    const clamp = (value: number, min: number, max: number) =>
      Math.min(Math.max(value, min), max);
    const allowedThemes = new Set(["night", "paper", "sepia"]);
    const fontScale = clamp(args.fontScale, -1, 3);
    const lineHeight = clamp(args.lineHeight, 1.4, 2.4);
    const contentWidth = clamp(args.contentWidth, 520, 960);
    const theme = allowedThemes.has(args.theme) ? args.theme : "night";
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const now = Date.now();
    const payload = {
      userId,
      fontScale,
      lineHeight,
      contentWidth,
      theme,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("userSettings", payload);
  },
});
