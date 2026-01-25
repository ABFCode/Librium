import { mutation } from "./_generated/server";

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
