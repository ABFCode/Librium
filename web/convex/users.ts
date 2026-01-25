import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const upsertUser = mutation({
  args: {
    authProvider: v.string(),
    externalId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_external_id", (q) =>
        q.eq("authProvider", args.authProvider).eq("externalId", args.externalId),
      )
      .first();

    if (existing) {
      if (
        (args.email && args.email !== existing.email) ||
        (args.name && args.name !== existing.name)
      ) {
        await ctx.db.patch(existing._id, {
          email: args.email ?? existing.email,
          name: args.name ?? existing.name,
        });
      }
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("users", {
      authProvider: args.authProvider,
      externalId: args.externalId,
      email: args.email,
      name: args.name,
      createdAt: now,
    });
  },
});

export const ensureViewer = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }
    const externalId =
      identity.subject ?? identity.tokenIdentifier ?? identity.email;
    if (!externalId) {
      throw new Error("Missing auth identity.");
    }
    const existing = await ctx.db
      .query("users")
      .withIndex("by_external_id", (q) =>
        q.eq("authProvider", "better-auth").eq("externalId", externalId),
      )
      .first();

    if (existing) {
      if (identity.email || identity.name) {
        await ctx.db.patch(existing._id, {
          email: identity.email ?? existing.email,
          name: identity.name ?? existing.name,
        });
      }
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("users", {
      authProvider: "better-auth",
      externalId,
      email: identity.email ?? undefined,
      name: identity.name ?? undefined,
      createdAt: now,
    });
  },
});
