import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
	internalAction,
	internalMutation,
	internalQuery,
} from "./_generated/server";
import { bookAssetKey } from "./books";
import { r2 } from "./r2";

// Tombstone compaction (ROADMAP sync rule 1): deleted rows are kept as
// `deletedAt` tombstones so deletes propagate to other devices instead of
// resurrecting. They only need to live until every device has synced past
// them; per the design, a fixed horizon stands in for device tracking. The
// accepted trade-off: a device offline for longer than the horizon may
// resurrect a deleted bookmark/collection on reconnect (idempotent clientKey
// creates make that harmless, if untidy).
const TOMBSTONE_HORIZON_MS = 90 * 24 * 60 * 60 * 1000;

// Per-run cap: these tables are personal-library sized (thousands, not
// millions), so a daily capped sweep converges quickly without risking the
// mutation read limits.
const BATCH = 500;

export const compactTombstones = internalMutation({
	args: {},
	handler: async (ctx) => {
		const horizon = Date.now() - TOMBSTONE_HORIZON_MS;
		for (const table of [
			"bookmarks",
			"collections",
			"collectionBooks",
		] as const) {
			// Indexed range: rows without deletedAt sort before all numbers in
			// the index, so gt(0) skips the living and the scan reads only actual
			// expired tombstones — no full-table scan, no read-ceiling risk.
			const expired = await ctx.db
				.query(table)
				.withIndex("by_deleted", (q) =>
					q.gt("deletedAt", 0).lt("deletedAt", horizon),
				)
				.take(BATCH);
			for (const doc of expired) {
				await ctx.db.delete(doc._id);
			}
		}
	},
});

// ── Orphaned-object sweep ────────────────────────────────────────────────
// The quota counts ATTACHED bytes (books rows with epubKey/coverKey), but a
// signed PUT URL is usable without ever calling finalizeUpload — an object
// can land in the bucket with no row that counts it: an abandoned or
// quota-rejected import, a book deleted mid-upload, an old client refused by
// the legacy attach path, or someone deliberately parking bytes. This sweep
// is what makes "usage = reality" true over time: any books/... object whose
// row doesn't claim it, older than a grace window, is deleted.

// Generous grace: an object younger than this may be a legitimately
// in-flight import (upload done, finalize pending).
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
const SWEEP_PAGE = 100;

const KEY_PATTERN = /^books\/([^/]+)\/(book\.epub|cover)$/;

/** Is this R2 key currently claimed by its book row? */
export const isKeyAttached = internalQuery({
	args: { key: v.string() },
	handler: async (ctx, args) => {
		const match = KEY_PATTERN.exec(args.key);
		if (!match) {
			// Not a book asset — never touch it.
			return true;
		}
		const bookId = ctx.db.normalizeId("books", match[1]);
		if (!bookId) {
			return false;
		}
		const book = await ctx.db.get(bookId);
		if (!book) {
			return false;
		}
		const expected =
			match[2] === "book.epub"
				? bookAssetKey(bookId, "epub")
				: bookAssetKey(bookId, "cover");
		return match[2] === "book.epub"
			? book.epubKey === expected
			: book.coverKey === expected;
	},
});

export const sweepOrphanedObjects = internalAction({
	args: {},
	handler: async (ctx) => {
		const cutoff = Date.now() - ORPHAN_GRACE_MS;
		let cursor: string | null = null;
		let removed = 0;
		// Paged walk over the R2 metadata index (populated by finalizeUpload's
		// syncMetadata and the component's own upload flow).
		for (;;) {
			const { page, isDone, continueCursor } = await r2.listMetadata(
				ctx,
				SWEEP_PAGE,
				cursor,
			);
			for (const meta of page) {
				if (!KEY_PATTERN.test(meta.key)) {
					continue;
				}
				const modified = Date.parse(meta.lastModified);
				if (!Number.isFinite(modified) || modified > cutoff) {
					continue;
				}
				const attached = await ctx.runQuery(
					internal.maintenance.isKeyAttached,
					{
						key: meta.key,
					},
				);
				if (!attached) {
					await r2.deleteObject(ctx, meta.key);
					removed += 1;
				}
			}
			if (isDone) {
				break;
			}
			cursor = continueCursor;
		}
		if (removed > 0) {
			console.log(`[librium] orphan sweep removed ${removed} object(s)`);
		}
	},
});
