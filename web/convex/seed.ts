import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation } from "./_generated/server";

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
// Internal-only: this remains convenient through `convex run` but is absent
// from the browser-callable API on every deployment.
export const createDemoUser = internalAction({
	args: {
		email: v.string(),
		password: v.string(),
		name: v.string(),
	},
	// Explicit return type breaks the self-referential inference cycle from
	// calling internal.seed within this module (standard Convex pattern).
	handler: async (
		ctx,
		args,
	): Promise<{ userId: Id<"users">; authUserId: string; email: string }> => {
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
		const userId = await ctx.runMutation(
			internal.seed.upsertBetterAuthUserInternal,
			{
				externalId: authUser.id,
				email: authUser.email ?? args.email,
				name: authUser.name ?? args.name,
			},
		);

		return {
			userId,
			authUserId: authUser.id,
			email: authUser.email ?? args.email,
		};
	},
});
