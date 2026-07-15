import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { bookAssetKey } from "./books";
import { r2 } from "./r2";

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
