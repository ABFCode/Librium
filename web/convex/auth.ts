import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { betterAuth } from "better-auth/minimal";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL!;

// Registration is closed on deployed instances until we're ready to release
// (ROADMAP Phase 7). Sign-in is unaffected. Local/dev deployments keep signup
// open for testing; prod opens it only when ALLOW_SIGNUP=true — same
// convention as ALLOW_ADMIN_RESET / ALLOW_SEED.
const deploymentName = process.env.CONVEX_DEPLOYMENT ?? "";
const convexUrl = process.env.CONVEX_URL ?? process.env.CONVEX_SITE_URL ?? "";
const isLocalDeployment =
  deploymentName.includes("local") || deploymentName.includes("anonymous");
const isLocalConvex =
  convexUrl.includes("127.0.0.1") || convexUrl.includes("localhost");
const allowSignUp =
  process.env.ALLOW_SIGNUP === "true" || isLocalDeployment || isLocalConvex;

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
    plugins: [crossDomain({ siteUrl }), convex({ authConfig })],
  });
};
