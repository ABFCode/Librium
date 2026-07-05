import { internalMutation, action } from "./_generated/server";
import { v } from "convex/values";

const deploymentName = process.env.CONVEX_DEPLOYMENT ?? "";
const convexUrl = process.env.CONVEX_URL ?? process.env.CONVEX_SITE_URL ?? "";
const isLocalDeployment =
  deploymentName.startsWith("local") ||
  deploymentName.startsWith("anonymous") ||
  deploymentName.includes("local") ||
  deploymentName.includes("anonymous");
const isLocalConvex =
  convexUrl.includes("127.0.0.1") || convexUrl.includes("localhost");
const allowSeed =
  process.env.ALLOW_SEED === "true" || isLocalDeployment || isLocalConvex;

export const upsertBetterAuthUserInternal = internalMutation({
  args: {
    externalId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_external_id", (q) =>
        q.eq("authProvider", "better-auth").eq("externalId", args.externalId),
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
      authProvider: "better-auth",
      externalId: args.externalId,
      email: args.email ?? undefined,
      name: args.name ?? undefined,
      createdAt: now,
    });
  },
});

// Dev convenience: create (or sign in) a demo auth user. Demo *books* are no
// longer seeded server-side — content is derived from real EPUBs parsed on
// the client (see ROADMAP Phase 5); import a book through the UI instead.
export const createDemoUser = action({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    if (!allowSeed) {
      throw new Error("Seeding is disabled in this environment.");
    }
    const baseUrl =
      process.env.CONVEX_SITE_URL ??
      process.env.VITE_CONVEX_SITE_URL ??
      process.env.CONVEX_URL ??
      process.env.VITE_CONVEX_URL;
    if (!baseUrl) {
      throw new Error("Missing Convex site URL for auth.");
    }
    const signUpUrl = new URL("/api/auth/sign-up/email", baseUrl).toString();
    const signInUrl = new URL("/api/auth/sign-in/email", baseUrl).toString();

    const createOrSignIn = async () => {
      const response = await fetch(signUpUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: args.email,
          password: args.password,
          name: args.name,
          rememberMe: true,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body?.user?.id) {
        return body.user;
      }
      const message = String(body?.message ?? "");
      const isExisting =
        response.status === 422 ||
        message.toLowerCase().includes("already exists") ||
        message.toLowerCase().includes("use another email");
      if (!isExisting) {
        throw new Error(body?.message ?? "Failed to create user.");
      }
      const signInResponse = await fetch(signInUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: args.email,
          password: args.password,
          rememberMe: true,
        }),
      });
      const signInBody = await signInResponse.json().catch(() => ({}));
      if (!signInResponse.ok || !signInBody?.user?.id) {
        throw new Error(signInBody?.message ?? "Failed to sign in user.");
      }
      return signInBody.user;
    };

    const authUser = await createOrSignIn();
    const userId = await ctx.runMutation("seed:upsertBetterAuthUserInternal", {
      externalId: authUser.id,
      email: authUser.email ?? args.email,
      name: authUser.name ?? args.name,
    });

    return {
      userId,
      authUserId: authUser.id,
      email: authUser.email ?? args.email,
    };
  },
});
