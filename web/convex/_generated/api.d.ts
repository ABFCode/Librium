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
import type * as bookAssets from "../bookAssets.js";
import type * as bookFiles from "../bookFiles.js";
import type * as bookmarks from "../bookmarks.js";
import type * as books from "../books.js";
import type * as http from "../http.js";
import type * as importJobs from "../importJobs.js";
import type * as ingest from "../ingest.js";
import type * as reader from "../reader.js";
import type * as sections from "../sections.js";
import type * as seed from "../seed.js";
import type * as storage from "../storage.js";
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
  bookAssets: typeof bookAssets;
  bookFiles: typeof bookFiles;
  bookmarks: typeof bookmarks;
  books: typeof books;
  http: typeof http;
  importJobs: typeof importJobs;
  ingest: typeof ingest;
  reader: typeof reader;
  sections: typeof sections;
  seed: typeof seed;
  storage: typeof storage;
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
};
