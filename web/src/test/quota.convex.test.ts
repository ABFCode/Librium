import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { limitBytesForPlan, quotaEnforced } from "../../convex/quota";
import schema from "../../convex/schema";

// Adversarial + property tests for the storage-quota plane — the code that
// gates money-adjacent behavior. The contract under test:
//
//   * usage is the sum of VERIFIED attached sizes, never client claims;
//   * the attached total never exceeds the limit, under any interleaving of
//     registers, attaches, and deletes;
//   * a rejected attach changes nothing (and never harms other books);
//   * deleting books frees quota;
//   * ownership and input sanity hold at every entry point.
//
// finalizeUpload's R2 glue (HEAD → size) can't run against the in-memory
// backend; the transactional authority it calls (attachVerified) is what's
// tested here. Polar is deliberately unconfigured in tests: plan resolution
// fails open to "free", which is also the tier whose limit matters.

const modules = import.meta.glob("../../convex/**/*.{js,ts}");

const SUBJECT = "user-a";
const MB = 1024 * 1024;

// 1 MB free limit for tests — small enough to hit with a few "books".
beforeAll(() => {
	process.env.QUOTA_ENFORCED = "1";
	process.env.FREE_QUOTA_MB = "1";
});
afterAll(() => {
	delete process.env.QUOTA_ENFORCED;
	delete process.env.FREE_QUOTA_MB;
});

const META = { title: "T" };

async function seed() {
	const t = convexTest(schema, modules);
	await t.run(async (ctx) => {
		await ctx.db.insert("users", {
			authProvider: "better-auth",
			externalId: SUBJECT,
			createdAt: 1,
		});
	});
	return { t, as: t.withIdentity({ subject: SUBJECT }) };
}

const register = (
	as: Awaited<ReturnType<typeof seed>>["as"],
	fileSize: number,
) =>
	as.mutation(api.books.registerImport, {
		fileName: "b.epub",
		fileSize,
		sectionCount: 1,
		metadata: META,
	});

const attach = (
	as: Awaited<ReturnType<typeof seed>>["as"],
	bookId: Id<"books">,
	verifiedSize: number,
) =>
	as.mutation(internal.books.attachVerified, {
		bookId,
		kind: "epub" as const,
		verifiedSize,
	});

const attachedState = (t: Awaited<ReturnType<typeof seed>>["t"]) =>
	t.run(async (ctx) => {
		const books = await ctx.db.query("books").collect();
		return books.map((b) => ({
			id: b._id,
			attached: Boolean(b.epubKey),
			fileSize: b.fileSize,
		}));
	});

describe("config", () => {
	test("limits resolve from env with sane fallbacks", () => {
		expect(quotaEnforced()).toBe(true);
		expect(limitBytesForPlan("free")).toBe(1 * MB);
		// Supporter default (env unset): 10 GB.
		expect(limitBytesForPlan("supporter")).toBe(10 * 1024 * MB);
		// Garbage env values fall back to defaults instead of exploding.
		process.env.FREE_QUOTA_MB = "banana";
		expect(limitBytesForPlan("free")).toBe(250 * MB);
		process.env.FREE_QUOTA_MB = "-5";
		expect(limitBytesForPlan("free")).toBe(250 * MB);
		process.env.FREE_QUOTA_MB = "1";
	});
});

describe("quota invariant under arbitrary interleavings", () => {
	test("attached total never exceeds the limit; rejections change nothing; deletes free space", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(
					fc.record({
						trueSize: fc.integer({ min: 0, max: 600 * 1024 }),
						deleteAfter: fc.boolean(),
					}),
					{ minLength: 1, maxLength: 6 },
				),
				fc.infiniteStream(fc.boolean()),
				async (specs, coins) => {
					const { t, as } = await seed();
					const limit = 1 * MB;
					const ids: Id<"books">[] = [];
					for (const _spec of specs) {
						// Declared size deliberately understates (0) — the pre-check
						// must not be what protects the limit.
						ids.push(await register(as, 0));
					}
					// Attach in order, interleaving deletes of already-attached
					// books when the spec (or a coin flip) says so.
					for (let i = 0; i < specs.length; i++) {
						const before = await attachedState(t);
						const attachedBefore = before
							.filter((b) => b.attached)
							.reduce((sum, b) => sum + (b.fileSize ?? 0), 0);
						const result = await attach(as, ids[i], specs[i].trueSize);

						const after = await attachedState(t);
						const attachedAfter = after
							.filter((b) => b.attached)
							.reduce((sum, b) => sum + (b.fileSize ?? 0), 0);

						// THE invariant: verified attached bytes never exceed the plan
						// limit, no matter what succeeded or failed.
						expect(attachedAfter).toBeLessThanOrEqual(limit);

						if (result.ok) {
							// Accepted → attached with exactly the verified size.
							const row = after.find((b) => b.id === ids[i]);
							expect(row?.attached).toBe(true);
							expect(row?.fileSize).toBe(specs[i].trueSize);
						} else {
							// Rejected → this book untouched, all others untouched.
							expect(result.code).toBe("quota_exceeded");
							expect(after).toEqual(before);
							expect(attachedAfter).toBe(attachedBefore);
						}

						if (specs[i].deleteAfter && coins.next().value) {
							// Delete an arbitrary attached book (if any) — space must
							// actually free up in the accounting.
							const victim = after.find((b) => b.attached);
							if (victim) {
								await as.mutation(internal.books.deleteBookData, {
									bookId: victim.id as Id<"books">,
								});
							}
						}
					}
					// After frees, a book that fits in the remaining space attaches.
					const state = await attachedState(t);
					const used = state
						.filter((b) => b.attached)
						.reduce((sum, b) => sum + (b.fileSize ?? 0), 0);
					const room = limit - used;
					if (room > 0) {
						const extra = await register(as, 0);
						const result = await attach(as, extra, room);
						expect(result.ok).toBe(true);
					}
				},
			),
			{ numRuns: 50 },
		);
	});
});

describe("adversarial inputs", () => {
	test("a lying client is caught at attach, not trusted at register", async () => {
		const { as } = await seed();
		// Claims 1 KB — sails through the register pre-check.
		const bookId = await register(as, 1024);
		// R2 reports 5 MB — rejected, nothing attached.
		const result = await attach(as, bookId, 5 * MB);
		expect(result).toMatchObject({ ok: false, code: "quota_exceeded" });
	});

	test("register pre-check rejects a declared size that cannot fit", async () => {
		const { as } = await seed();
		await expect(register(as, 2 * MB)).rejects.toThrow(ConvexError);
	});

	test("register rejects non-finite and negative sizes", async () => {
		const { as } = await seed();
		await expect(register(as, Number.NaN)).rejects.toThrow(
			/invalid file size/i,
		);
		await expect(register(as, -1)).rejects.toThrow(/invalid file size/i);
		await expect(register(as, Number.POSITIVE_INFINITY)).rejects.toThrow(
			/invalid file size/i,
		);
	});

	test("re-finalizing the same book replaces its size instead of double-counting", async () => {
		const { t, as } = await seed();
		const bookId = await register(as, 0);
		// 600 KB attaches; re-attaching the same 600 KB must not read as 1.2 MB.
		expect((await attach(as, bookId, 600 * 1024)).ok).toBe(true);
		expect((await attach(as, bookId, 600 * 1024)).ok).toBe(true);
		const state = await attachedState(t);
		expect(state).toHaveLength(1);
		expect(state[0].fileSize).toBe(600 * 1024);
	});

	test("another user cannot finalize someone else's book", async () => {
		const { t, as } = await seed();
		const bookId = await register(as, 0);
		await t.run(async (ctx) => {
			await ctx.db.insert("users", {
				authProvider: "better-auth",
				externalId: "user-b",
				createdAt: 1,
			});
		});
		const asB = t.withIdentity({ subject: "user-b" });
		await expect(
			asB.mutation(internal.books.attachVerified, {
				bookId,
				kind: "epub" as const,
				verifiedSize: 1,
			}),
		).rejects.toThrow(/not authorized/i);
	});

	test("legacy attachFiles refuses while enforcement is on (no unverified bypass)", async () => {
		const { as } = await seed();
		const bookId = await register(as, 0);
		await expect(
			as.mutation(api.books.attachFiles, {
				bookId,
				epubKey: `books/${bookId}/book.epub`,
			}),
		).rejects.toThrow(ConvexError);
	});

	test("oversized cover is rejected and the dangling key cleared; a sane cover attaches", async () => {
		const { t, as } = await seed();
		const bookId = await register(as, 0);
		// Sane cover first (simulates an existing cover being replaced).
		const ok = await as.mutation(internal.books.attachVerified, {
			bookId,
			kind: "cover" as const,
			verifiedSize: 200 * 1024,
		});
		expect(ok.ok).toBe(true);
		// Oversized replacement: the fixed-key upload already destroyed the old
		// object, so the row must fall back to no-cover, not dangle.
		const rejected = await as.mutation(internal.books.attachVerified, {
			bookId,
			kind: "cover" as const,
			verifiedSize: 11 * MB,
		});
		expect(rejected).toMatchObject({ ok: false, code: "cover_too_large" });
		const row = await t.run((ctx) => ctx.db.get(bookId));
		expect(row?.coverKey).toBeUndefined();
		expect(row?.coverUpdatedAt).toBeUndefined();
	});

	test("covers do not consume the byte quota", async () => {
		const { as } = await seed();
		const bookId = await register(as, 0);
		expect(
			(
				await as.mutation(internal.books.attachVerified, {
					bookId,
					kind: "cover" as const,
					verifiedSize: 9 * MB,
				})
			).ok,
		).toBe(true);
		// The full 1 MB is still available for the EPUB itself.
		expect((await attach(as, bookId, 1 * MB)).ok).toBe(true);
	});
});

describe("existing data is never harmed", () => {
	test("going over-limit blocks new uploads only — reads and deletes still work", async () => {
		const { t, as } = await seed();
		// Library legitimately at the limit (e.g. plan downgraded afterwards).
		const a = await register(as, 0);
		expect((await attach(as, a, 1 * MB)).ok).toBe(true);

		// New upload blocked…
		await expect(register(as, 1)).rejects.toThrow(ConvexError);

		// …but the existing book is fully readable (listed, key present)…
		const listed = await as.query(api.books.listByOwner, {});
		expect(listed).toHaveLength(1);
		expect(listed[0].epubKey).toBe(`books/${a}/book.epub`);

		// …and deleting frees the space for the next import.
		await as.mutation(internal.books.deleteBookData, { bookId: a });
		const b = await register(as, 1 * MB);
		expect((await attach(as, b, 1 * MB)).ok).toBe(true);
		void t;
	});

	test("quota is per-user: one user's full bucket doesn't block another", async () => {
		const { t, as } = await seed();
		const a = await register(as, 0);
		expect((await attach(as, a, 1 * MB)).ok).toBe(true);

		await t.run(async (ctx) => {
			await ctx.db.insert("users", {
				authProvider: "better-auth",
				externalId: "user-b",
				createdAt: 1,
			});
		});
		const asB = t.withIdentity({ subject: "user-b" });
		const b = await asB.mutation(api.books.registerImport, {
			fileName: "b.epub",
			fileSize: 1 * MB,
			sectionCount: 1,
			metadata: META,
		});
		expect(
			(
				await asB.mutation(internal.books.attachVerified, {
					bookId: b,
					kind: "epub" as const,
					verifiedSize: 1 * MB,
				})
			).ok,
		).toBe(true);
	});
});

describe("enforcement off (pre-billing deployments)", () => {
	test("everything attaches regardless of size, but true sizes are still recorded", async () => {
		delete process.env.QUOTA_ENFORCED;
		try {
			const { t, as } = await seed();
			const bookId = await register(as, 1);
			const result = await attach(as, bookId, 50 * MB);
			expect(result.ok).toBe(true);
			const state = await attachedState(t);
			expect(state[0].fileSize).toBe(50 * MB);
		} finally {
			process.env.QUOTA_ENFORCED = "1";
		}
	});
});

describe("attached books survive re-finalize (data-destruction guard)", () => {
	test("a finalize retry on an attached book succeeds even when the owner is over-limit", async () => {
		const { t, as } = await seed();
		const bookId = await register(as, 0);
		expect((await attach(as, bookId, 1 * MB)).ok).toBe(true);
		// Downgrade below current usage (e.g. supporter lapsed; 0 is a legal
		// operator value now). A retry of the SAME attach must short-circuit
		// to success — a rejection here would let finalizeUpload delete the
		// book's only cloud copy.
		process.env.FREE_QUOTA_MB = "0";
		try {
			const retry = await attach(as, bookId, 1 * MB);
			expect(retry.ok).toBe(true);
			const state = await attachedState(t);
			expect(state[0].attached).toBe(true);
			expect(state[0].fileSize).toBe(1 * MB);
		} finally {
			process.env.FREE_QUOTA_MB = "1";
		}
	});

	test("a size-changed re-attach that busts the limit unsets the key instead of dangling", async () => {
		const { t, as } = await seed();
		const bookId = await register(as, 0);
		expect((await attach(as, bookId, 600 * 1024)).ok).toBe(true);
		// Only reachable by re-PUTting with a leftover signed URL (re-mints
		// are refused): the object no longer matches what was attached, the
		// caller will delete it, so the key must not dangle.
		const result = await attach(as, bookId, 2 * MB);
		expect(result).toMatchObject({ ok: false, code: "quota_exceeded" });
		const state = await attachedState(t);
		expect(state[0].attached).toBe(false);
	});

	test("epub upload URLs cannot be re-minted once attached", async () => {
		const { as } = await seed();
		const bookId = await register(as, 0);
		expect((await attach(as, bookId, 1024)).ok).toBe(true);
		await expect(
			as.mutation(api.books.generateBookUploadUrl, {
				bookId,
				kind: "epub" as const,
			}),
		).rejects.toThrow(/already uploaded/i);
	});
});

describe("orphan sweep bookkeeping (isKeyAttached)", () => {
	test("claims exactly the keys that rows point at", async () => {
		const { t, as } = await seed();
		const attachedBook = await register(as, 0);
		expect((await attach(as, attachedBook, 1024)).ok).toBe(true);
		const pendingBook = await register(as, 0);

		const check = (key: string) =>
			as.query(internal.maintenance.isKeyAttached, { key });

		// Attached epub is claimed; its never-uploaded cover is not.
		expect(await check(`books/${attachedBook}/book.epub`)).toBe(true);
		expect(await check(`books/${attachedBook}/cover`)).toBe(false);
		// Registered-but-unfinalized book claims nothing.
		expect(await check(`books/${pendingBook}/book.epub`)).toBe(false);
		// Deleted book claims nothing.
		await as.mutation(internal.books.deleteBookData, {
			bookId: attachedBook,
		});
		expect(await check(`books/${attachedBook}/book.epub`)).toBe(false);
		// Garbage ids are unclaimed (sweepable)…
		expect(await check("books/not-a-real-id/book.epub")).toBe(false);
		// …but keys outside the book-asset shape are never touched.
		expect(await check("something/else.bin")).toBe(true);
		expect(await check(`books/${pendingBook}/other.txt`)).toBe(true);
		void t;
	});
});
