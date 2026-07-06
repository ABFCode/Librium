import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import { allowSignUp, isDeployedInstance } from "./authPolicy";

// May be unset until `convex env set SITE_URL` runs (fresh deployments push
// functions first) — auth just won't trust any origin until it's configured.
const siteUrl = process.env.SITE_URL ?? "";

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
	return betterAuth({
		trustedOrigins: [siteUrl],
		database: authComponent.adapter(ctx),
		emailAndPassword: {
			enabled: true,
			disableSignUp: !allowSignUp,
			requireEmailVerification: false,
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
			},
		},
		plugins: [crossDomain({ siteUrl }), convex({ authConfig })],
	});
};
