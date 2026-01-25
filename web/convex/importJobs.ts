import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getViewerUserId } from "./authHelpers";

export const createImportJobInternal = internalMutation({
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
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getViewerUserId(ctx);
    if (!userId) {
      return [];
    }
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("importJobs")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});

export const getImportJob = query({
  args: {
    importJobId: v.id("importJobs"),
  },
  handler: async (ctx, args) => {
    const userId = await getViewerUserId(ctx);
    if (!userId) {
      return null;
    }
    const job = await ctx.db.get(args.importJobId);
    if (!job || job.userId !== userId) {
      return null;
    }
    return job;
  },
});

export const updateImportJobStatusInternal = internalMutation({
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
    if (args.status === "parsing" || args.status === "ingesting") {
      update.startedAt = now;
    }
    if (args.status === "completed" || args.status === "failed") {
      update.finishedAt = now;
    }
    await ctx.db.patch(args.importJobId, update);
  },
});

export const clearImportJobs = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getViewerUserId(ctx);
    if (!userId) {
      return;
    }
    const jobs = await ctx.db
      .query("importJobs")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .collect();
    for (const job of jobs) {
      await ctx.db.delete(job._id);
    }
  },
});
