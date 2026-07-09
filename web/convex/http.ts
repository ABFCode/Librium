import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";
import { polar } from "./billing";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });

// Polar webhooks (subscription lifecycle → component tables). Signature is
// verified against POLAR_WEBHOOK_SECRET inside the component; endpoint is
// {CONVEX_SITE_URL}/polar/events, configured in the Polar dashboard.
polar.registerRoutes(http, { path: "/polar/events" });

export default http;
