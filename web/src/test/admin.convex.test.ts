import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

// Account deletion (privacy-page promise). deleteUserRowsInternal is the
// transactional core; the wrapping action's R2/auth-component glue can't run
// against the in-memory backend and is smoke-tested against a live dev
// deployment instead. The property that matters here: EVERY row of the
// target user goes, and NOTHING of anyone else's does.

const modules = import.meta.glob("../../convex/**/*.{js,ts}");

async function seedUser(
	t: ReturnType<typeof convexTest>,
	tag: string,
): Promise<{ userId: Id<"users">; bookId: Id<"books"> }> {
	return t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {
			authProvider: "better-auth",
			externalId: `auth-${tag}`,
			email: `${tag}@test.local`,
			createdAt: 1,
		});
		const bookId = await ctx.db.insert("books", {
			ownerId: userId,
			title: `Book of ${tag}`,
			epubKey: `books/placeholder-${tag}/book.epub`,
			fileSize: 1024,
			createdAt: 1,
			updatedAt: 1,
		});
		await ctx.db.insert("userBooks", {
			userId,
			bookId,
			lastSectionIndex: 0,
			updatedAt: 1,
		});
		await ctx.db.insert("progressHistory", {
			userId,
			bookId,
			sectionIndex: 0,
			progressServerTime: 1,
			recordedAt: 1,
			cause: "reading",
		});
		await ctx.db.insert("bookmarks", {
			userId,
			bookId,
			sectionIndex: 0,
			blockIndex: 0,
			offset: 0,
			createdAt: 1,
		});
		const collectionId = await ctx.db.insert("collections", {
			userId,
			name: `Shelf of ${tag}`,
			clientKey: `ck-${tag}`,
			createdAt: 1,
			updatedAt: 1,
		});
		await ctx.db.insert("collectionBooks", {
			userId,
			collectionId,
			bookId,
			clientKey: `ckb-${tag}`,
			createdAt: 1,
			updatedAt: 1,
		});
		await ctx.db.insert("userSettings", {
			userId,
			fontScale: 1,
			lineHeight: 1.6,
			contentWidth: 680,
			theme: "paper",
			updatedAt: 1,
		});
		return { userId, bookId };
	});
}

const rowsFor = (t: ReturnType<typeof convexTest>, userId: Id<"users">) =>
	t.run(async (ctx) => {
		const owned = <T extends { userId?: Id<"users">; ownerId?: Id<"users"> }>(
			rows: T[],
		) => rows.filter((r) => r.userId === userId || r.ownerId === userId);
		return {
			user: await ctx.db.get(userId),
			books: owned(await ctx.db.query("books").collect()).length,
			userBooks: owned(await ctx.db.query("userBooks").collect()).length,
			progressHistory: owned(await ctx.db.query("progressHistory").collect())
				.length,
			bookmarks: owned(await ctx.db.query("bookmarks").collect()).length,
			collections: owned(await ctx.db.query("collections").collect()).length,
			collectionBooks: owned(await ctx.db.query("collectionBooks").collect())
				.length,
			userSettings: owned(await ctx.db.query("userSettings").collect()).length,
		};
	});

describe("admin.deleteUserRowsInternal", () => {
	test("deletes every row of the target user and nothing of anyone else's", async () => {
		const t = convexTest(schema, modules);
		const a = await seedUser(t, "alice");
		const b = await seedUser(t, "bob");

		const result = await t.mutation(internal.admin.deleteUserRowsInternal, {
			email: "alice@test.local",
		});
		expect(result.authUserId).toBe("auth-alice");
		expect(result.bookIds).toEqual([a.bookId]);

		const alice = await rowsFor(t, a.userId);
		expect(alice).toEqual({
			user: null,
			books: 0,
			userBooks: 0,
			progressHistory: 0,
			bookmarks: 0,
			collections: 0,
			collectionBooks: 0,
			userSettings: 0,
		});

		const bob = await rowsFor(t, b.userId);
		expect(bob.user?.email).toBe("bob@test.local");
		expect(bob.books).toBe(1);
		expect(bob.userBooks).toBe(1);
		expect(bob.progressHistory).toBe(1);
		expect(bob.bookmarks).toBe(1);
		expect(bob.collections).toBe(1);
		expect(bob.collectionBooks).toBe(1);
		expect(bob.userSettings).toBe(1);
	});

	test("unknown email returns empty (the action decides not-found using auth records too)", async () => {
		const t = convexTest(schema, modules);
		await seedUser(t, "alice");
		const result = await t.mutation(internal.admin.deleteUserRowsInternal, {
			email: "nobody@test.local",
		});
		expect(result).toEqual({ bookIds: [], authUserId: null });
	});
});

describe("admin.resetAllData", () => {
	test("requires explicit confirmation and clears app rows through the internal API", async () => {
		const t = convexTest(schema, modules);
		const user = await seedUser(t, "reset-target");

		await expect(
			t.mutation(internal.admin.resetAllData, { confirm: "not-reset" }),
		).rejects.toThrow("Confirmation required");
		expect((await rowsFor(t, user.userId)).books).toBe(1);

		await expect(
			t.mutation(internal.admin.resetAllData, { confirm: "RESET" }),
		).resolves.toEqual({ ok: true });
		expect(await rowsFor(t, user.userId)).toEqual({
			user: null,
			books: 0,
			userBooks: 0,
			progressHistory: 0,
			bookmarks: 0,
			collections: 0,
			collectionBooks: 0,
			userSettings: 0,
		});
	});
});
