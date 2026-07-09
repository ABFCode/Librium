import { convexTest } from "convex-test";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

// Property-based tests over the *real* sync merge functions (via convex-test's
// in-memory backend). The sync layer is the most correctness-critical code in
// the app and the hardest for example-based tests to cover: what matters is
// that arbitrary operation orderings — the reality of multiple devices and
// offline queues flushing in any sequence — converge to one correct state.
// The two documented bug classes are LWW rejection (status) and tombstone
// resurrection (bookmarks); these target exactly those.

// convex-test discovers the backend functions from this glob.
const modules = import.meta.glob("../../convex/**/*.{js,ts}");

const SUBJECT = "user-a";

async function seed() {
	const t = convexTest(schema, modules);
	const bookId = await t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {
			authProvider: "better-auth",
			externalId: SUBJECT,
			createdAt: 1,
		});
		return ctx.db.insert("books", {
			ownerId: userId,
			title: "Test Book",
			createdAt: 1,
			updatedAt: 1,
		});
	});
	return { as: t.withIdentity({ subject: SUBJECT }), bookId };
}

const STATUSES = ["reading", "finished", "want", "abandoned"] as const;

describe("status LWW converges regardless of apply order", () => {
	test("final status is the write with the highest editedAt", async () => {
		await fc.assert(
			fc.asyncProperty(
				// Writes with DISTINCT edit times (distinct → an unambiguous winner)
				// and any permutation of their application order.
				fc
					.uniqueArray(fc.integer({ min: 1, max: 10_000 }), {
						minLength: 1,
						maxLength: 8,
					})
					.chain((times) =>
						fc.record({
							writes: fc.constant(times).chain((ts) =>
								fc.tuple(
									...ts.map((editedAt) =>
										fc.record({
											editedAt: fc.constant(editedAt),
											status: fc.constantFrom(...STATUSES, null),
										}),
									),
								),
							),
							order: fc.constant(times).chain((ts) =>
								fc.shuffledSubarray([...ts.keys()], {
									minLength: ts.length,
									maxLength: ts.length,
								}),
							),
						}),
					),
				async ({ writes, order }) => {
					const { as, bookId } = await seed();
					for (const i of order) {
						await as.mutation(api.userBooks.updateStatus, {
							bookId,
							status: writes[i].status,
							editedAt: writes[i].editedAt,
						});
					}
					const winner = writes.reduce((a, b) =>
						b.editedAt > a.editedAt ? b : a,
					);
					const row = await as.query(api.userBooks.getUserBook, { bookId });
					// null status is stored as an absent field.
					expect(row?.status ?? null).toBe(winner.status);
				},
			),
			{ numRuns: 200 },
		);
	});
});

describe("bookmark tombstones never resurrect", () => {
	test("a key ever deleted ends tombstoned; others live; no duplicates", async () => {
		await fc.assert(
			fc.asyncProperty(
				// Ops over a few clientKeys. Every key's first op is a create (you
				// can't delete what was never made); creates/deletes then interleave
				// freely — the multi-device reality.
				fc.array(
					fc.record({
						key: fc.constantFrom("k1", "k2", "k3"),
						op: fc.constantFrom("create", "delete"),
					}),
					{ minLength: 1, maxLength: 24 },
				),
				async (rawOps) => {
					const { as, bookId } = await seed();
					const created = new Set<string>();
					const deleted = new Set<string>();
					// Map clientKey → bookmark id for delete targeting.
					const idByKey = new Map<string, string>();

					for (const { key, op } of rawOps) {
						if (op === "create" || !created.has(key)) {
							// Force the first op per key to be a create.
							const id = await as.mutation(api.bookmarks.createBookmark, {
								bookId,
								sectionIndex: 0,
								blockIndex: 0,
								offset: 0,
								clientKey: key,
							});
							created.add(key);
							idByKey.set(key, id);
						} else {
							const id = idByKey.get(key);
							if (id) {
								await as.mutation(api.bookmarks.deleteBookmark, {
									bookmarkId: id as never,
								});
								deleted.add(key);
							}
						}
					}

					const rows = await as.query(api.bookmarks.listByUserBook, { bookId });
					// Idempotent creates: exactly one row per created key.
					const byKey = new Map<string, (typeof rows)[number]>();
					for (const row of rows) {
						expect(row.clientKey).toBeDefined();
						expect(byKey.has(row.clientKey as string)).toBe(false);
						byKey.set(row.clientKey as string, row);
					}
					expect(byKey.size).toBe(created.size);
					for (const key of created) {
						const row = byKey.get(key);
						if (deleted.has(key)) {
							// No resurrection: once deleted, stays tombstoned even after
							// a same-key create re-runs.
							expect(row?.deletedAt).toBeDefined();
						} else {
							expect(row?.deletedAt).toBeUndefined();
						}
					}
				},
			),
			{ numRuns: 200 },
		);
	});
});
