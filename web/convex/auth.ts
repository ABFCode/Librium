import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { requireActionCtx } from "@convex-dev/better-auth/utils";
import { betterAuth } from "better-auth/minimal";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import { allowSignUp, isDeployedInstance } from "./authPolicy";
import { resetPasswordEmail, sendAuthEmail, verifyEmailEmail } from "./email";

// Public frontend origin (cross-domain trust) and auth HTTP origin (callback /
// token URL) are different. Convex supplies CONVEX_SITE_URL in deployments;
// VITE_* fallbacks keep the local backend aligned with .env.local. Passing an
// explicit auth base also prevents Better Auth from deriving it independently
// on every request (and warning for every token/JWKS call).
const siteUrl =
	process.env.SITE_URL ?? process.env.VITE_SITE_URL ?? "http://localhost:3000";
const authBaseUrl =
	process.env.BETTER_AUTH_URL ??
	process.env.CONVEX_SITE_URL ??
	process.env.VITE_CONVEX_SITE_URL;

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
	return betterAuth({
		...(authBaseUrl ? { baseURL: authBaseUrl } : {}),
		trustedOrigins: [
			siteUrl,
			// Production-offline Playwright serves the built PWA here. Never add
			// test origins to a deployed instance's trust surface.
			...(!isDeployedInstance ? ["http://localhost:4173"] : []),
		],
		database: authComponent.adapter(ctx),
		emailAndPassword: {
			enabled: true,
			disableSignUp: !allowSignUp,
			// Flip with REQUIRE_EMAIL_VERIFICATION=true before opening public
			// signups. Off by default so existing (pre-verification) accounts
			// never lock out and local/e2e flows need no mailbox.
			requireEmailVerification:
				process.env.REQUIRE_EMAIL_VERIFICATION === "true",
			sendResetPassword: async ({ user, url }) => {
				await sendAuthEmail(requireActionCtx(ctx), {
					to: user.email,
					...resetPasswordEmail(url),
				});
			},
		},
		emailVerification: {
			sendVerificationEmail: async ({ user, url }) => {
				await sendAuthEmail(requireActionCtx(ctx), {
					to: user.email,
					...verifyEmailEmail(url),
				});
			},
		},
		// Throttle auth endpoints on deployed instances. `storage: "database"`
		// persists counters in the component's rateLimit table (serverless-safe;
		// in-memory counters don't survive across Convex invocations). Disabled
		// locally so dev/tests aren't throttled. If Convex can't surface a client
		// IP, Better Auth falls back to a shared per-path bucket — still throttles
		// brute force, just coarser; sign-in max is kept loose to avoid lockout.
		rateLimit: {
			enabled: isDeployedInstance,
			storage: "database",
			window: 60,
			max: 100,
			customRules: {
				"/sign-in/email": { window: 60, max: 20 },
				// Each request emails someone. Tight cap so the endpoint can't be
				// used to flood a victim's inbox (or burn the Resend quota).
				"/request-password-reset": { window: 60, max: 5 },
			},
		},
		plugins: [crossDomain({ siteUrl }), convex({ authConfig })],
	});
};
