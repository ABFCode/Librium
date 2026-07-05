// Single source of truth for whether email/password registration is open.
// Closed by default on deployed instances (ROADMAP Phase 7); local/dev
// deployments always allow signup; prod reopens it with ALLOW_SIGNUP=true —
// same convention as ALLOW_ADMIN_RESET / ALLOW_SEED.
//
// Enforced server-side in auth.ts (emailAndPassword.disableSignUp) and mirrored
// to the UI via the public config.signupEnabled query so the sign-up form and
// links reflect it without a rebuild.
const deploymentName = process.env.CONVEX_DEPLOYMENT ?? "";
const convexUrl = process.env.CONVEX_URL ?? process.env.CONVEX_SITE_URL ?? "";
const isLocalDeployment =
  deploymentName.includes("local") || deploymentName.includes("anonymous");
const isLocalConvex =
  convexUrl.includes("127.0.0.1") || convexUrl.includes("localhost");

export const allowSignUp =
  process.env.ALLOW_SIGNUP === "true" || isLocalDeployment || isLocalConvex;
