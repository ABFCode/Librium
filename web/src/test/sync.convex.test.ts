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

describe("server-versioned status conflicts", () => {
	test("rejects a stale device without consulting its wall clock", async () => {
		const { as, bookId } = await seed();
		const first = await as.mutation(api.userBooks.updateStatus, {
			bookId,
			status: "reading",
			baseServerTime: 0,
		});
		expect(first.accepted).toBe(true);
		const second = await as.mutation(api.userBooks.updateStatus, {
			bookId,
			status: "finished",
			baseServerTime: first.serverTime,
		});
		expect(second.accepted).toBe(true);
		const stale = await as.mutation(api.userBooks.updateStatus, {
			bookId,
			status: "abandoned",
			baseServerTime: first.serverTime,
		});
		expect(stale.accepted).toBe(false);
		const row = await as.query(api.userBooks.getUserBook, { bookId });
		expect(row?.status).toBe("finished");
		expect(row?.statusUpdatedAt).toBe(second.serverTime);
	});

	test("progress and status versions do not invalidate each other", async () => {
		const { as, bookId } = await seed();
		const status = await as.mutation(api.userBooks.updateStatus, {
			bookId,
			status: "want",
			baseServerTime: 0,
		});
		const progress = await as.mutation(api.userBooks.updateProgress, {
			bookId,
			lastSectionIndex: 2,
			baseServerTime: 0,
		});
		expect(progress.accepted).toBe(true);
		const nextStatus = await as.mutation(api.userBooks.updateStatus, {
			bookId,
			status: "reading",
			baseServerTime: status.serverTime,
		});
		expect(nextStatus.accepted).toBe(true);
	});
});

describe("server-versioned progress conflicts", () => {
	test("rejects a stale chapter without rolling back newer reading progress", async () => {
		const { as, bookId } = await seed();
		const chapterOne = await as.mutation(api.userBooks.updateProgress, {
			bookId,
			lastSectionIndex: 0,
			baseServerTime: 0,
		});
		expect(chapterOne.accepted).toBe(true);

		const chapterSixteen = await as.mutation(api.userBooks.updateProgress, {
			bookId,
			lastSectionIndex: 15,
			baseServerTime: chapterOne.serverTime,
		});
		expect(chapterSixteen.accepted).toBe(true);

		const staleComputer = await as.mutation(api.userBooks.updateProgress, {
			bookId,
			lastSectionIndex: 0,
			baseServerTime: chapterOne.serverTime,
		});
		expect(staleComputer.accepted).toBe(false);

		const row = await as.query(api.userBooks.getUserBook, { bookId });
		expect(row?.lastSectionIndex).toBe(15);
		expect(row?.progressUpdatedAt).toBe(chapterSixteen.serverTime);
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
