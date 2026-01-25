import { ConvexReactClient } from "convex/react";

const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
  throw new Error("Missing VITE_CONVEX_URL environment variable.");
}

export const convexClient = new ConvexReactClient(convexUrl, {
  expectAuth: true,
});
