import { convexTest } from "convex-test";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
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
	return { t, as: t.withIdentity({ subject: SUBJECT }), bookId };
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

	test("a missing base from an old client cannot bypass conflict checks", async () => {
		const { as, bookId } = await seed();
		const current = await as.mutation(api.userBooks.updateProgress, {
			bookId,
			lastSectionIndex: 15,
			baseServerTime: 0,
		});
		expect(current.accepted).toBe(true);

		const staleOldClient = await as.mutation(api.userBooks.updateProgress, {
			bookId,
			lastSectionIndex: 0,
		});
		expect(staleOldClient.accepted).toBe(false);
		expect(
			(await as.query(api.userBooks.getUserBook, { bookId }))?.lastSectionIndex,
		).toBe(15);
	});

	test("arbitrary interleaved progress and status writes obey their own causal versions", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(
					fc.record({
						field: fc.constantFrom("progress", "status"),
						stale: fc.boolean(),
						value: fc.nat({ max: 200 }),
					}),
					{ minLength: 1, maxLength: 30 },
				),
				async (operations) => {
					const { as, bookId } = await seed();
					let progressVersion = 0;
					let statusVersion = 0;
					let expectedSection = 0;
					let expectedStatus: "reading" | "finished" = "reading";
					for (const operation of operations) {
						if (operation.field === "progress") {
							const base = operation.stale ? 0 : progressVersion;
							const result = await as.mutation(api.userBooks.updateProgress, {
								bookId,
								lastSectionIndex: operation.value,
								baseServerTime: base,
							});
							const shouldAccept = base >= progressVersion;
							expect(result.accepted).toBe(shouldAccept);
							if (shouldAccept) {
								if (
									progressVersion > 0 &&
									operation.value === expectedSection
								) {
									expect(result.serverTime).toBe(progressVersion);
								} else {
									expect(result.serverTime).toBeGreaterThan(progressVersion);
								}
								progressVersion = result.serverTime;
								expectedSection = operation.value;
							}
						} else {
							const base = operation.stale ? 0 : statusVersion;
							const value = operation.value % 2 === 0 ? "reading" : "finished";
							const result = await as.mutation(api.userBooks.updateStatus, {
								bookId,
								status: value,
								baseServerTime: base,
							});
							const shouldAccept = base >= statusVersion;
							expect(result.accepted).toBe(shouldAccept);
							if (shouldAccept) {
								expect(result.serverTime).toBeGreaterThan(statusVersion);
								statusVersion = result.serverTime;
								expectedStatus = value;
							}
						}
					}
					const row = await as.query(api.userBooks.getUserBook, { bookId });
					expect(row?.lastSectionIndex).toBe(expectedSection);
					expect(row?.status ?? "reading").toBe(expectedStatus);
				},
			),
			{ numRuns: 100 },
		);
	});
});

describe("recoverable progress history", () => {
	test("an identical accepted save is idempotent and preserves provenance", async () => {
		const { as, bookId } = await seed();
		const original = await as.mutation(api.userBooks.updateProgress, {
			bookId,
			lastSectionIndex: 3,
			lastBlockIndex: 2,
			lastBlockOffset: 0.5,
			lastSectionFraction: 0.4,
			baseServerTime: 0,
			deviceId: "phone-installation",
			deviceKind: "phone",
		});
		const duplicate = await as.mutation(api.userBooks.updateProgress, {
			bookId,
			lastSectionIndex: 3,
			lastBlockIndex: 2,
			lastBlockOffset: 0.5,
			lastSectionFraction: 0.4,
			baseServerTime: original.serverTime,
			deviceId: "computer-installation",
			deviceKind: "computer",
		});
		expect(duplicate.serverTime).toBe(original.serverTime);
		const recovery = await as.query(api.userBooks.listProgressHistory, {
			bookId,
		});
		expect(recovery.current?.deviceKind).toBe("phone");
		expect(recovery.history).toHaveLength(0);
	});

	test("normalizes corrupted local coordinates before they become shared history", async () => {
		const { t, as, bookId } = await seed();
		await t.run((ctx) => ctx.db.patch(bookId, { sectionCount: 3 }));
		const first = await as.mutation(api.userBooks.updateProgress, {
			bookId,
			lastSectionIndex: -8,
			lastBlockIndex: 2.9,
			lastBlockOffset: 4,
			lastSectionFraction: -2,
			baseServerTime: 0,
			deviceId: `  ${"x".repeat(100)}  `,
			deviceKind: "unknown",
		});
		expect(first).toEqual(
			expect.objectContaining({
				lastSectionIndex: 0,
				lastBlockIndex: 2,
				lastBlockOffset: 1,
				lastSectionFraction: 0,
			}),
		);
		const second = await as.mutation(api.userBooks.updateProgress, {
			bookId,
			lastSectionIndex: 99,
			lastBlockIndex: -4,
			lastBlockOffset: -1,
			lastSectionFraction: 5,
			baseServerTime: first.serverTime,
		});
		expect(second).toEqual(
			expect.objectContaining({
				lastSectionIndex: 2,
				lastBlockIndex: 0,
				lastBlockOffset: 0,
				lastSectionFraction: 1,
			}),
		);
		const recovery = await as.query(api.userBooks.listProgressHistory, {
			bookId,
		});
		expect(recovery.history[0]).toEqual(
			expect.objectContaining({
				sectionIndex: 0,
				blockIndex: 2,
				blockOffset: 1,
				sectionFraction: 0,
			}),
		);
		expect(recovery.history[0]?.deviceId).toHaveLength(64);
	});

	test("accepted chapter changes preserve the displaced position and stale writes do not", async () => {
		const { as, bookId } = await seed();
		const chapterOne = await as.mutation(api.userBooks.updateProgress, {
			bookId,
			lastSectionIndex: 0,
			lastSectionFraction: 0.4,
			baseServerTime: 0,
			deviceId: "phone-installation",
			deviceKind: "phone",
		});
		const chapterSixteen = await as.mutation(api.userBooks.updateProgress, {
			bookId,
			lastSectionIndex: 15,
			lastSectionFraction: 0.25,
			baseServerTime: chapterOne.serverTime,
			deviceId: "computer-installation",
			deviceKind: "computer",
		});

		let recovery = await as.query(api.userBooks.listProgressHistory, {
			bookId,
		});
		expect(recovery.current).toEqual(
			expect.objectContaining({
				sectionIndex: 15,
				deviceKind: "computer",
				serverTime: chapterSixteen.serverTime,
			}),
		);
		expect(recovery.history).toHaveLength(1);
		expect(recovery.history[0]).toEqual(
			expect.objectContaining({
				sectionIndex: 0,
				sectionFraction: 0.4,
				deviceKind: "phone",
				cause: "reading",
			}),
		);

		const stale = await as.mutation(api.userBooks.updateProgress, {
			bookId,
			lastSectionIndex: 0,
			baseServerTime: chapterOne.serverTime,
			deviceId: "stale-installation",
			deviceKind: "computer",
		});
		expect(stale.accepted).toBe(false);
		recovery = await as.query(api.userBooks.listProgressHistory, { bookId });
		expect(recovery.history).toHaveLength(1);
		expect(recovery.current?.sectionIndex).toBe(15);

		const intentionalBacktrack = await as.mutation(
			api.userBooks.updateProgress,
			{
				bookId,
				lastSectionIndex: 0,
				baseServerTime: chapterSixteen.serverTime,
				deviceId: "phone-installation",
				deviceKind: "phone",
			},
		);
		expect(intentionalBacktrack.accepted).toBe(true);
		recovery = await as.query(api.userBooks.listProgressHistory, { bookId });
		expect(recovery.history[0]).toEqual(
			expect.objectContaining({
				sectionIndex: 15,
				deviceKind: "computer",
				largeBackwardJump: true,
			}),
		);
	});

	test("long chapters create bounded meaningful checkpoints instead of one row per scroll", async () => {
		const { as, bookId } = await seed();
		let result = await as.mutation(api.userBooks.updateProgress, {
			bookId,
			lastSectionIndex: 0,
			lastSectionFraction: 0.05,
			baseServerTime: 0,
		});
		for (const fraction of [0.15, 0.3, 0.35, 0.45]) {
			result = await as.mutation(api.userBooks.updateProgress, {
				bookId,
				lastSectionIndex: 0,
				lastSectionFraction: fraction,
				baseServerTime: result.serverTime,
			});
		}
		const recovery = await as.query(api.userBooks.listProgressHistory, {
			bookId,
		});
		expect(recovery.current?.sectionFraction).toBe(0.45);
		expect(recovery.history.map((row) => row.sectionFraction)).toEqual([
			0.3, 0.15,
		]);
	});

	test("restore is a new causal write and preserves the displaced current position", async () => {
		const { as, bookId } = await seed();
		const first = await as.mutation(api.userBooks.updateProgress, {
			bookId,
			lastSectionIndex: 0,
			lastBlockIndex: 3,
			lastBlockOffset: 0.5,
			baseServerTime: 0,
		});
		const later = await as.mutation(api.userBooks.updateProgress, {
			bookId,
			lastSectionIndex: 8,
			lastBlockIndex: 7,
			lastBlockOffset: 0.25,
			baseServerTime: first.serverTime,
		});
		const before = await as.query(api.userBooks.listProgressHistory, {
			bookId,
		});
		const chapterOne = before.history[0];
		if (!chapterOne) throw new Error("checkpoint missing");

		const restored = await as.mutation(api.userBooks.restoreProgress, {
			bookId,
			historyId: chapterOne._id,
			baseServerTime: later.serverTime,
			deviceId: "restore-device",
			deviceKind: "tablet",
		});
		expect(restored).toEqual(
			expect.objectContaining({
				accepted: true,
				changed: true,
				lastSectionIndex: 0,
				lastBlockIndex: 3,
				lastBlockOffset: 0.5,
			}),
		);
		expect(restored.serverTime).toBeGreaterThan(later.serverTime);

		const after = await as.query(api.userBooks.listProgressHistory, { bookId });
		expect(after.current).toEqual(
			expect.objectContaining({
				sectionIndex: 0,
				deviceKind: "tablet",
				serverTime: restored.serverTime,
			}),
		);
		expect(after.history[0]).toEqual(
			expect.objectContaining({
				sectionIndex: 8,
				blockIndex: 7,
				cause: "restore",
				largeBackwardJump: true,
			}),
		);
	});

	test("a stale restore cannot overwrite newer reading or create a false checkpoint", async () => {
		const { as, bookId } = await seed();
		const first = await as.mutation(api.userBooks.updateProgress, {
			bookId,
			lastSectionIndex: 0,
			baseServerTime: 0,
		});
		const second = await as.mutation(api.userBooks.updateProgress, {
			bookId,
			lastSectionIndex: 2,
			baseServerTime: first.serverTime,
		});
		const opened = await as.query(api.userBooks.listProgressHistory, {
			bookId,
		});
		const oldPosition = opened.history[0];
		if (!oldPosition) throw new Error("checkpoint missing");
		const newest = await as.mutation(api.userBooks.updateProgress, {
			bookId,
			lastSectionIndex: 5,
			baseServerTime: second.serverTime,
		});
		const countBefore = (
			await as.query(api.userBooks.listProgressHistory, { bookId })
		).history.length;

		const staleRestore = await as.mutation(api.userBooks.restoreProgress, {
			bookId,
			historyId: oldPosition._id,
			baseServerTime: second.serverTime,
		});
		expect(staleRestore.accepted).toBe(false);
		expect(staleRestore.serverTime).toBe(newest.serverTime);
		const after = await as.query(api.userBooks.listProgressHistory, { bookId });
		expect(after.current?.sectionIndex).toBe(5);
		expect(after.history).toHaveLength(countBefore);
	});

	test("retains only the newest fifty checkpoints per book", async () => {
		const { as, bookId } = await seed();
		let version = 0;
		for (let section = 0; section <= 60; section += 1) {
			const result = await as.mutation(api.userBooks.updateProgress, {
				bookId,
				lastSectionIndex: section,
				baseServerTime: version,
			});
			version = result.serverTime;
		}
		const recovery = await as.query(api.userBooks.listProgressHistory, {
			bookId,
		});
		expect(recovery.current?.sectionIndex).toBe(60);
		expect(recovery.history).toHaveLength(50);
		expect(recovery.history[0]?.sectionIndex).toBe(59);
		expect(recovery.history.at(-1)?.sectionIndex).toBe(10);
	});

	test("history is owner-only and is removed with the book", async () => {
		const { t, as, bookId } = await seed();
		const first = await as.mutation(api.userBooks.updateProgress, {
			bookId,
			lastSectionIndex: 0,
			baseServerTime: 0,
		});
		await as.mutation(api.userBooks.updateProgress, {
			bookId,
			lastSectionIndex: 1,
			baseServerTime: first.serverTime,
		});
		await t.run(async (ctx) => {
			await ctx.db.insert("users", {
				authProvider: "better-auth",
				externalId: "user-b",
				createdAt: 1,
			});
		});
		const intruder = t.withIdentity({ subject: "user-b" });
		await expect(
			intruder.query(api.userBooks.listProgressHistory, { bookId }),
		).rejects.toThrow(/Not authorized/);

		await as.mutation(internal.books.deleteBookData, { bookId });
		const remaining = await t.run((ctx) =>
			ctx.db.query("progressHistory").collect(),
		);
		expect(remaining).toHaveLength(0);
	});
});

describe("collection membership idempotency", () => {
	test("concurrent device keys create one live membership per book", async () => {
		const { as, bookId } = await seed();
		const collection = await as.mutation(api.collections.createCollection, {
			name: "Shared",
			clientKey: "collection-key",
		});
		const first = await as.mutation(api.collections.addBookMembership, {
			collectionId: collection.id,
			bookId,
			clientKey: "device-a-key",
		});
		const second = await as.mutation(api.collections.addBookMembership, {
			collectionId: collection.id,
			bookId,
			clientKey: "device-b-key",
		});
		expect(second?.id).toBe(first?.id);
		const memberships = await as.query(
			api.collections.listMembershipsByUser,
			{},
		);
		expect(
			memberships.filter(
				(row) => row.bookId === bookId && row.deletedAt === undefined,
			),
		).toHaveLength(1);
	});

	test("legacy endpoints keep their id shape and cannot resurrect versioned tombstones", async () => {
		const { as, bookId } = await seed();
		const collection = await as.mutation(api.collections.createCollection, {
			name: "Shared",
			clientKey: "collection-key",
		});
		const legacyId = await as.mutation(api.collections.addBookToCollection, {
			collectionId: collection.id,
			bookId,
			clientKey: "legacy-key",
		});
		expect(typeof legacyId).toBe("string");
		if (!legacyId) throw new Error("legacy add failed");

		const current = (
			await as.query(api.collections.listMembershipsByUser, {})
		).find((row) => row._id === legacyId);
		if (!current) throw new Error("membership missing");
		const removed = await as.mutation(api.collections.removeBookMembership, {
			membershipId: current._id,
			baseServerTime: current.updatedAt,
		});
		expect(removed?.deleted).toBe(true);

		const retryId = await as.mutation(api.collections.addBookToCollection, {
			collectionId: collection.id,
			bookId,
			clientKey: "legacy-key",
		});
		expect(retryId).toBe(legacyId);
		const after = (
			await as.query(api.collections.listMembershipsByUser, {})
		).find((row) => row._id === legacyId);
		expect(after?.deletedAt).toBeDefined();
	});

	test("a delayed add cannot resurrect a newer remove", async () => {
		const { as, bookId } = await seed();
		const collection = await as.mutation(api.collections.createCollection, {
			name: "Shared",
			clientKey: "collection-key",
		});
		const added = await as.mutation(api.collections.addBookMembership, {
			collectionId: collection.id,
			bookId,
			clientKey: "device-a-key",
			baseServerTime: 0,
		});
		expect(added?.accepted).toBe(true);
		if (!added) throw new Error("collection disappeared");
		const removed = await as.mutation(api.collections.removeBookMembership, {
			membershipId: added.id,
			baseServerTime: added.serverTime,
		});
		expect(removed?.accepted).toBe(true);

		const delayedAdd = await as.mutation(api.collections.addBookMembership, {
			collectionId: collection.id,
			bookId,
			clientKey: "offline-device-key",
			baseServerTime: added.serverTime,
		});
		expect(delayedAdd?.accepted).toBe(false);
		expect(delayedAdd?.deleted).toBe(true);
	});

	test("an observed tombstone can be intentionally re-added and defeats a stale remove", async () => {
		const { as, bookId } = await seed();
		const collection = await as.mutation(api.collections.createCollection, {
			name: "Shared",
			clientKey: "collection-key",
		});
		const added = await as.mutation(api.collections.addBookMembership, {
			collectionId: collection.id,
			bookId,
			clientKey: "membership-key",
			baseServerTime: 0,
		});
		if (!added) throw new Error("collection disappeared");
		const removed = await as.mutation(api.collections.removeBookMembership, {
			membershipId: added.id,
			baseServerTime: added.serverTime,
		});
		if (!removed) throw new Error("membership disappeared");
		const readded = await as.mutation(api.collections.addBookMembership, {
			collectionId: collection.id,
			bookId,
			clientKey: "membership-key",
			baseServerTime: removed.serverTime,
		});
		expect(readded?.accepted).toBe(true);
		expect(readded?.deleted).toBe(false);

		const staleRemove = await as.mutation(
			api.collections.removeBookMembership,
			{
				membershipId: added.id,
				baseServerTime: added.serverTime,
			},
		);
		expect(staleRemove?.accepted).toBe(false);
		expect(staleRemove?.deleted).toBe(false);
	});
});

describe("collection rename acknowledgement loss", () => {
	test("an idempotent create retry cannot borrow a newer rename version", async () => {
		const { as } = await seed();
		const created = await as.mutation(api.collections.createCollection, {
			name: "Original",
			clientKey: "stable-key",
		});
		const current = await as.mutation(api.collections.renameCollection, {
			collectionId: created.id,
			name: "Current name",
			baseServerTime: created.serverTime,
		});
		expect(current.accepted).toBe(true);

		// Device A lost the create response and retries its old request. The
		// returned base must still describe creation, not Device B's later rename.
		const retriedCreate = await as.mutation(api.collections.createCollection, {
			name: "Original",
			clientKey: "stable-key",
		});
		expect(retriedCreate.serverTime).toBe(created.serverTime);
		const staleRename = await as.mutation(api.collections.renameCollection, {
			collectionId: created.id,
			name: "Stale device name",
			baseServerTime: retriedCreate.serverTime,
		});
		expect(staleRename.accepted).toBe(false);
		const rows = await as.query(api.collections.listByUser, {});
		expect(rows[0]?.name).toBe("Current name");
	});
});

describe("field-versioned reader settings", () => {
	test("the first concurrent edits to different fields both survive", async () => {
		const { as } = await seed();
		const theme = await as.mutation(api.userSettings.upsert, {
			theme: "sepia",
			baseVersions: { theme: 0 },
		});
		const font = await as.mutation(api.userSettings.upsert, {
			fontFamily: "serif",
			baseVersions: { fontFamily: 0 },
		});
		expect(theme.accepted.theme).toBe(true);
		expect(font.accepted.fontFamily).toBe(true);
		const saved = await as.query(api.userSettings.getByUser, {});
		expect(saved?.theme).toBe("sepia");
		expect(saved?.fontFamily).toBe("serif");
	});

	test("concurrent edits to different fields both survive", async () => {
		const { as } = await seed();
		const initial = await as.mutation(api.userSettings.upsert, {
			theme: "night",
			fontScale: 0,
		});
		const theme = await as.mutation(api.userSettings.upsert, {
			theme: "sepia",
			baseVersions: { theme: initial.serverVersions.theme },
		});
		const font = await as.mutation(api.userSettings.upsert, {
			fontScale: 2,
			baseVersions: { fontScale: initial.serverVersions.fontScale },
		});
		expect(theme.accepted.theme).toBe(true);
		expect(font.accepted.fontScale).toBe(true);
		const saved = await as.query(api.userSettings.getByUser, {});
		expect(saved?.theme).toBe("sepia");
		expect(saved?.fontScale).toBe(2);
	});

	test("a stale edit cannot overwrite a newer value of the same field", async () => {
		const { as } = await seed();
		const initial = await as.mutation(api.userSettings.upsert, {
			theme: "night",
		});
		const current = await as.mutation(api.userSettings.upsert, {
			theme: "paper",
			baseVersions: { theme: initial.serverVersions.theme },
		});
		const stale = await as.mutation(api.userSettings.upsert, {
			theme: "sepia",
			baseVersions: { theme: initial.serverVersions.theme },
		});
		expect(current.accepted.theme).toBe(true);
		expect(stale.accepted.theme).toBe(false);
		expect(stale.settings.theme).toBe("paper");
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
