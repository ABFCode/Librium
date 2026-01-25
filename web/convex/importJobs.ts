import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createImportJob = mutation({
  args: {
    userId: v.id("users"),
    fileName: v.string(),
    fileSize: v.number(),
    contentType: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("importJobs", {
      userId: args.userId,
      fileName: args.fileName,
      fileSize: args.fileSize,
      contentType: args.contentType,
      storageId: args.storageId,
      status: "queued",
      createdAt: now,
    });
  },
});

export const listImportJobs = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("importJobs")
      .withIndex("by_user_created", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);
  },
});

export const getImportJob = query({
  args: {
    importJobId: v.id("importJobs"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.importJobId);
  },
});

export const updateImportJobStatus = mutation({
  args: {
    importJobId: v.id("importJobs"),
    status: v.string(),
    errorMessage: v.optional(v.string()),
    bookId: v.optional(v.id("books")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const update: Record<string, unknown> = {
      status: args.status,
    };
    if (args.bookId) {
      update.bookId = args.bookId;
    }
    if (args.errorMessage) {
      update.errorMessage = args.errorMessage;
    }
    if (args.status === "in_progress") {
      update.startedAt = now;
    }
    if (args.status === "completed" || args.status === "failed") {
      update.finishedAt = now;
    }
    await ctx.db.patch(args.importJobId, update);
  },
});
