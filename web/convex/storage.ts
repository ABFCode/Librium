import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireViewerUserId } from "./authHelpers";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireViewerUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getFileUrl = mutation({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await requireViewerUserId(ctx);
    return await ctx.storage.getUrl(args.storageId);
  },
});
