import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
	getViewerUserId,
	requireBookOwner,
	requireViewerUserId,
} from "./authHelpers";
import { nextServerVersion, observedServerVersion } from "./syncVersion";

export const upsertUserBook = mutation({
	args: {
		bookId: v.id("books"),
	},
	handler: async (ctx, args) => {
		const userId = await requireViewerUserId(ctx);
		await requireBookOwner(ctx, args.bookId);
		const existing = await ctx.db
			.query("userBooks")
			.withIndex("by_user_book", (q) =>
				q.eq("userId", userId).eq("bookId", args.bookId),
			)
			.first();

		const now = nextServerVersion(existing?.updatedAt ?? 0);
		if (existing) {
			// Opening a book is reading activity → bump Recent recency.
			await ctx.db.patch(existing._id, {
				updatedAt: now,
				lastActivityAt: now,
			});
			return existing._id;
		}

		return await ctx.db.insert("userBooks", {
			userId,
			bookId: args.bookId,
			lastSectionIndex: 0,
			updatedAt: now,
			lastActivityAt: now,
		});
	},
});

export const getUserBook = query({
	args: {
		bookId: v.id("books"),
	},
	handler: async (ctx, args) => {
		const userId = await getViewerUserId(ctx);
		if (!userId) {
			return null;
		}
		// Graceful when the book was deleted (possibly from another device) —
		// a live reader subscription must not explode into an error page.
		const book = await ctx.db.get(args.bookId);
		if (!book || book.ownerId !== userId) {
			return null;
		}
		return await ctx.db
			.query("userBooks")
			.withIndex("by_user_book", (q) =>
				q.eq("userId", userId).eq("bookId", args.bookId),
			)
			.first();
	},
});

export const updateProgress = mutation({
	args: {
		bookId: v.id("books"),
		lastSectionIndex: v.optional(v.number()),
		lastBlockIndex: v.optional(v.number()),
		lastBlockOffset: v.optional(v.number()),
		lastSectionFraction: v.optional(v.number()),
		// Last server version this device actually merged before editing.
		baseServerTime: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const userId = await requireViewerUserId(ctx);
		await requireBookOwner(ctx, args.bookId);
		const existing = await ctx.db
			.query("userBooks")
			.withIndex("by_user_book", (q) =>
				q.eq("userId", userId).eq("bookId", args.bookId),
			)
			.first();

		const currentServerTime =
			existing?.progressUpdatedAt ??
			(existing?.progressEditedAt !== undefined ? existing.updatedAt : 0);
		// Optimistic concurrency: a stale offline write must not overwrite a
		// server value it never observed. Device wall clocks are irrelevant.
		if (
			existing &&
			observedServerVersion(args.baseServerTime) < currentServerTime
		) {
			return {
				id: existing._id,
				accepted: false,
				serverTime: currentServerTime,
				lastSectionIndex: existing.lastSectionIndex ?? 0,
				lastBlockIndex: existing.lastBlockIndex,
				lastBlockOffset: existing.lastBlockOffset,
				lastSectionFraction: existing.lastSectionFraction,
			};
		}

		const now = nextServerVersion(currentServerTime);
		const patch = {
			lastSectionIndex:
				args.lastSectionIndex ?? existing?.lastSectionIndex ?? 0,
			lastBlockIndex:
				args.lastBlockIndex ?? existing?.lastBlockIndex ?? undefined,
			lastBlockOffset:
				args.lastBlockOffset ?? existing?.lastBlockOffset ?? undefined,
			lastSectionFraction:
				args.lastSectionFraction ?? existing?.lastSectionFraction ?? undefined,
			updatedAt: now,
			// Reading is activity → drives Recent recency.
			lastActivityAt: now,
			progressUpdatedAt: now,
		};

		if (existing) {
			await ctx.db.patch(existing._id, patch);
			return {
				id: existing._id,
				accepted: true,
				serverTime: now,
				lastSectionIndex: patch.lastSectionIndex,
				lastBlockIndex: patch.lastBlockIndex,
				lastBlockOffset: patch.lastBlockOffset,
				lastSectionFraction: patch.lastSectionFraction,
			};
		}

		const id = await ctx.db.insert("userBooks", {
			userId,
			bookId: args.bookId,
			...patch,
		});
		return {
			id,
			accepted: true,
			serverTime: now,
			lastSectionIndex: patch.lastSectionIndex,
			lastBlockIndex: patch.lastBlockIndex,
			lastBlockOffset: patch.lastBlockOffset,
			lastSectionFraction: patch.lastSectionFraction,
		};
	},
});

export const updateStatus = mutation({
	args: {
		bookId: v.id("books"),
		// null clears the explicit status → the client derives one from progress.
		status: v.union(
			v.literal("reading"),
			v.literal("finished"),
			v.literal("want"),
			v.literal("abandoned"),
			v.null(),
		),
		// Status has its own server version so progress activity cannot make an
		// otherwise-current offline status change stale.
		baseServerTime: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const userId = await requireViewerUserId(ctx);
		await requireBookOwner(ctx, args.bookId);
		const existing = await ctx.db
			.query("userBooks")
			.withIndex("by_user_book", (q) =>
				q.eq("userId", userId).eq("bookId", args.bookId),
			)
			.first();

		const currentServerTime =
			existing?.statusUpdatedAt ??
			(existing?.statusEditedAt !== undefined ? existing.updatedAt : 0);
		// Reject a write based on older server state. Bump updatedAt so the
		// subscription re-emits and the losing device promptly re-adopts.
		if (
			existing &&
			observedServerVersion(args.baseServerTime) < currentServerTime
		) {
			await ctx.db.patch(existing._id, {
				updatedAt: nextServerVersion(existing.updatedAt),
			});
			return {
				id: existing._id,
				accepted: false,
				serverTime: currentServerTime,
				status: existing.status ?? null,
			};
		}

		const now = nextServerVersion(currentServerTime);
		// Note: no lastActivityAt here — marking a status is organizing, not
		// reading, so it must not reorder the Recent shelf. A never-opened book
		// marked from the shelf is inserted with lastActivityAt absent, so it
		// sorts last in Recent (behind everything actually read).
		const patch = {
			status: args.status ?? undefined,
			statusUpdatedAt: now,
			updatedAt: now,
		};

		if (existing) {
			await ctx.db.patch(existing._id, patch);
			return {
				id: existing._id,
				accepted: true,
				serverTime: now,
				status: args.status,
			};
		}

		const id = await ctx.db.insert("userBooks", {
			userId,
			bookId: args.bookId,
			lastSectionIndex: 0,
			...patch,
		});
		return { id, accepted: true, serverTime: now, status: args.status };
	},
});

export const listRecentByUser = query({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const userId = await getViewerUserId(ctx);
		if (!userId) {
			return [];
		}
		const limit = args.limit ?? 8;
		// Recency = reading activity, not the sync clock. Rows with no activity
		// yet (status-only, never opened) have lastActivityAt undefined, which
		// Convex orders before all values → last under desc, i.e. behind every
		// book actually read.
		const entries = await ctx.db
			.query("userBooks")
			.withIndex("by_user_activity", (q) => q.eq("userId", userId))
			.order("desc")
			.take(limit);

		const results = [];
		for (const entry of entries) {
			const book = await ctx.db.get(entry.bookId);
			if (book && book.ownerId === userId) {
				results.push({
					entryId: entry._id,
					book,
					updatedAt: entry.updatedAt,
				});
			}
		}
		return results;
	},
});

export const listByUser = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getViewerUserId(ctx);
		if (!userId) {
			return [];
		}
		const entries = await ctx.db
			.query("userBooks")
			.withIndex("by_user_book", (q) => q.eq("userId", userId))
			.collect();

		const results = [];
		for (const entry of entries) {
			const book = await ctx.db.get(entry.bookId);
			if (!book || book.ownerId !== userId) {
				continue;
			}
			const totalSections = book.sectionCount ?? 0;
			const lastIndex = entry.lastSectionIndex ?? 0;
			// Completed chapters plus the fraction of the current one — a fresh
			// book reads 0%, a 1-chapter book can progress, and finishing the last
			// chapter reaches 100%.
			const progress =
				totalSections > 0
					? Math.min(
							(lastIndex + (entry.lastSectionFraction ?? 0)) / totalSections,
							1,
						)
					: 0;
			results.push({
				bookId: entry.bookId,
				lastSectionTitle: null,
				lastSectionIndex: lastIndex,
				totalSections,
				progress,
				status: entry.status ?? null,
				statusUpdatedAt:
					entry.statusUpdatedAt ??
					(entry.statusEditedAt !== undefined ? entry.updatedAt : 0),
				updatedAt: entry.updatedAt,
			});
		}
		return results;
	},
});
