import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { bookAssetKey } from "./books";
import { r2 } from "./r2";

// Note: blobs live in R2 now; this clears Convex rows only. Orphaned R2
// objects from a full reset are dev debris — clear the bucket manually (or
// via lifecycle rules) if it matters. Internal-only means browser clients can
// never invoke it, even if an operator misconfigures an environment flag.
export const resetAllData = internalMutation({
	args: { confirm: v.string() },
	handler: async (ctx, args) => {
		if (args.confirm !== "RESET") {
			throw new Error("Confirmation required.");
		}
		const bookmarks = await ctx.db.query("bookmarks").collect();
		for (const bookmark of bookmarks) {
			await ctx.db.delete(bookmark._id);
		}

		const userBooks = await ctx.db.query("userBooks").collect();
		for (const entry of userBooks) {
			await ctx.db.delete(entry._id);
		}

		const progressHistory = await ctx.db.query("progressHistory").collect();
		for (const checkpoint of progressHistory) {
			await ctx.db.delete(checkpoint._id);
		}

		const userSettings = await ctx.db.query("userSettings").collect();
		for (const setting of userSettings) {
			await ctx.db.delete(setting._id);
		}

		const collectionBooks = await ctx.db.query("collectionBooks").collect();
		for (const membership of collectionBooks) {
			await ctx.db.delete(membership._id);
		}

		const collections = await ctx.db.query("collections").collect();
		for (const collection of collections) {
			await ctx.db.delete(collection._id);
		}

		const books = await ctx.db.query("books").collect();
		for (const book of books) {
			// Legacy pre-R2 rows stored the cover in Convex storage.
			const legacyCover = (book as unknown as { coverStorageId?: never })
				.coverStorageId;
			if (legacyCover) {
				await ctx.storage.delete(legacyCover).catch(() => {});
			}
			await ctx.db.delete(book._id);
		}

		const users = await ctx.db.query("users").collect();
		for (const user of users) {
			await ctx.db.delete(user._id);
		}

		// Legacy tables from pre-R2 schemas: rows here block pushing a schema
		// that no longer declares them, and their Convex-storage blobs would
		// otherwise be orphaned. Safe to remove once nothing references them.
		const legacyTables = ["sections", "bookAssets", "bookFiles", "importJobs"];
		for (const table of legacyTables) {
			try {
				const rows = await ctx.db.query(table as never).collect();
				for (const row of rows) {
					const r = row as unknown as {
						_id: never;
						storageId?: never;
						contentStorageId?: never;
					};
					if (r.storageId) {
						await ctx.storage.delete(r.storageId).catch(() => {});
					}
					if (r.contentStorageId) {
						await ctx.storage.delete(r.contentStorageId).catch(() => {});
					}
					await ctx.db.delete(r._id);
				}
			} catch {
				// Table no longer exists — nothing to clean.
			}
		}

		return { ok: true };
	},
});

// ── Account deletion ─────────────────────────────────────────────────────
// Fulfills the privacy-page promise ("email hello@librium.dev and it will
// be done within 30 days") as ONE operator-run action instead of a hand
// checklist across seven tables, a bucket, and the auth component:
//
//   npx convex run admin:deleteUserAccount \
//     '{"email":"person@example.com","confirm":"DELETE"}' --prod
//
// Deliberately NOT touched: the Polar customer. Polar is the merchant of
// record and retains billing records for tax/legal compliance — cancel any
// active subscription in the Polar dashboard first; their records are their
// obligation. Internal-only (not callable from clients) plus a typed
// confirm string against fat-fingered emails.

/**
 * Delete every app-table row belonging to the user. Runs WITHOUT ownership
 * checks (there's no viewer identity in an admin context) — the caller is
 * the internal action below, keyed by exact email. Returns what the action
 * needs for the non-transactional cleanup (R2 objects, auth records).
 */
export const deleteUserRowsInternal = internalMutation({
	args: { email: v.string() },
	handler: async (ctx, args) => {
		// users has no email index; the table is operator-scale, a scan is fine.
		// A missing row is NOT an error: the app row is only created on the
		// first mutation, so a signed-up-but-never-imported account has auth
		// records and nothing else — the action still cleans those.
		const users = await ctx.db.query("users").collect();
		const user = users.find((u) => u.email === args.email);
		if (!user) {
			return { bookIds: [] as string[], authUserId: null };
		}
		const userId = user._id;

		const books = await ctx.db
			.query("books")
			.withIndex("by_owner", (q) => q.eq("ownerId", userId))
			.collect();
		const bookIds = books.map((b) => b._id);
		for (const book of books) {
			await ctx.db.delete(book._id);
		}
		// by_user_book's prefix is userId, so eq(userId) ranges the whole user.
		for (const table of ["userBooks", "bookmarks"] as const) {
			const rows = await ctx.db
				.query(table)
				.withIndex("by_user_book", (q) => q.eq("userId", userId))
				.collect();
			for (const row of rows) {
				await ctx.db.delete(row._id);
			}
		}
		const progressHistory = await ctx.db
			.query("progressHistory")
			.withIndex("by_user_book_recorded", (q) => q.eq("userId", userId))
			.collect();
		for (const checkpoint of progressHistory) {
			await ctx.db.delete(checkpoint._id);
		}
		for (const table of ["collections", "collectionBooks"] as const) {
			const rows = await ctx.db
				.query(table)
				.withIndex("by_user", (q) => q.eq("userId", userId))
				.collect();
			for (const row of rows) {
				await ctx.db.delete(row._id);
			}
		}
		const settings = await ctx.db
			.query("userSettings")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		for (const row of settings) {
			await ctx.db.delete(row._id);
		}
		await ctx.db.delete(userId);

		return {
			bookIds: bookIds as string[],
			// Better Auth's user id — our externalId — keys its session/account
			// rows; email keys its verification rows.
			authUserId: user.externalId as string | null,
		};
	},
});

export const deleteUserAccount = internalAction({
	args: { email: v.string(), confirm: v.string() },
	// Explicit annotations break the internal.admin self-reference cycle
	// created by the mutation call below.
	handler: async (
		ctx,
		args,
	): Promise<{ deletedBooks: number; email: string }> => {
		if (args.confirm !== "DELETE") {
			throw new Error('Pass confirm: "DELETE" to delete an account.');
		}
		const {
			bookIds,
			authUserId: appAuthUserId,
		}: { bookIds: string[]; authUserId: string | null } = await ctx.runMutation(
			internal.admin.deleteUserRowsInternal,
			{ email: args.email },
		);
		// The auth user can exist without an app row (signed up, never ran a
		// mutation) — resolve it by email so those accounts are deletable too.
		const authUser: { _id?: string } | null = await ctx.runQuery(
			components.betterAuth.adapter.findOne,
			{
				model: "user",
				where: [{ field: "email", value: args.email }],
			} as never,
		);
		if (bookIds.length === 0 && !appAuthUserId && !authUser) {
			throw new Error(`No user with email ${args.email}.`);
		}
		const authUserId = appAuthUserId ?? (authUser?._id as string | undefined);
		// Blobs: derived keys, unconditionally — same rationale as deleteBook
		// (a mid-import book may hold objects its row never recorded).
		for (const bookId of bookIds) {
			await r2.deleteObject(ctx, bookAssetKey(bookId, "epub"));
			await r2.deleteObject(ctx, bookAssetKey(bookId, "cover"));
		}
		// Auth records: sessions/accounts key on userId, verification on the
		// email, then the user row itself. deleteMany paginates; loop to done.
		const deleteAuthRows = async (
			model: string,
			field: string,
			value: string,
		) => {
			let cursor: string | null = null;
			for (;;) {
				// The adapter's arg types are generic over the component's own data
				// model; the cross-component call site can't express that, so the
				// args are cast (the shapes are validated server-side regardless).
				const result: { isDone: boolean; continueCursor: string } =
					await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
						input: {
							model,
							where: [{ field, value }],
						},
						paginationOpts: { cursor, numItems: 100 },
					} as never);
				if (result.isDone) {
					return;
				}
				cursor = result.continueCursor;
			}
		};
		if (authUserId) {
			await deleteAuthRows("session", "userId", authUserId);
			await deleteAuthRows("account", "userId", authUserId);
		}
		await deleteAuthRows("verification", "identifier", args.email);
		await deleteAuthRows("user", "email", args.email);

		return { deletedBooks: bookIds.length, email: args.email };
	},
});
