import betterAuth from "@convex-dev/better-auth/convex.config";
import polar from "@convex-dev/polar/convex.config.js";
import r2 from "@convex-dev/r2/convex.config.js";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(betterAuth);
app.use(r2);
app.use(polar);

export default app;
