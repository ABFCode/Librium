import { R2 } from "@convex-dev/r2";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { requireViewerUserId } from "./authHelpers";

// Cloudflare R2 is the blob plane (ROADMAP Phase 5): raw EPUBs + covers only.
// Parsed blocks/images are derived data — devices re-parse from the EPUB.
// Credentials live in Convex deployment env vars (R2_TOKEN, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET).
export const r2 = new R2(components.r2);

// Deliberately NOT exposing clientApi's generateUploadUrl: it mints signed
// PUT URLs for random keys outside any book prefix — bytes the storage quota
// never counts and no delete path ever reclaims. All uploads go through
// books.generateBookUploadUrl (prefix-bound) + books.finalizeUpload
// (size-verified) instead.
//
// syncMetadata stays exported one release for frontends deployed before
// finalizeUpload (their import flow calls it after upload); it only refreshes
// the metadata index and returns nothing.
export const { syncMetadata } = r2.clientApi<DataModel>({
	checkUpload: async (ctx) => {
		// Only signed-in users may touch the metadata index.
		await requireViewerUserId(ctx as never);
	},
});
