import { internalMutation } from "./_generated/server";

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
