/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as authHelpers from "../authHelpers.js";
import type * as authPolicy from "../authPolicy.js";
import type * as billing from "../billing.js";
import type * as bookmarks from "../bookmarks.js";
import type * as books from "../books.js";
import type * as collections from "../collections.js";
import type * as config from "../config.js";
import type * as crons from "../crons.js";
import type * as email from "../email.js";
import type * as http from "../http.js";
import type * as maintenance from "../maintenance.js";
import type * as metadata from "../metadata.js";
import type * as metadataProviders from "../metadataProviders.js";
import type * as quota from "../quota.js";
import type * as r2 from "../r2.js";
import type * as seed from "../seed.js";
import type * as syncVersion from "../syncVersion.js";
import type * as userBooks from "../userBooks.js";
import type * as userSettings from "../userSettings.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  authHelpers: typeof authHelpers;
  authPolicy: typeof authPolicy;
  billing: typeof billing;
  bookmarks: typeof bookmarks;
  books: typeof books;
  collections: typeof collections;
  config: typeof config;
  crons: typeof crons;
  email: typeof email;
  http: typeof http;
  maintenance: typeof maintenance;
  metadata: typeof metadata;
  metadataProviders: typeof metadataProviders;
  quota: typeof quota;
  r2: typeof r2;
  seed: typeof seed;
  syncVersion: typeof syncVersion;
  userBooks: typeof userBooks;
  userSettings: typeof userSettings;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  r2: import("@convex-dev/r2/_generated/component.js").ComponentApi<"r2">;
  polar: import("@convex-dev/polar/_generated/component.js").ComponentApi<"polar">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
};
