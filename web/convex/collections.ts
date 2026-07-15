import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
	getViewerUserId,
	requireBookOwner,
	requireViewerUserId,
} from "./authHelpers";

// Collections: user-named, many-to-many book groups. Same sync plane as
// bookmarks — client-generated clientKeys make offline creates idempotent,
// deletedAt tombstones propagate deletes instead of resurrecting rows.

export const listByUser = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getViewerUserId(ctx);
		if (!userId) {
			return [];
		}
		// Tombstones included: clients need them to settle local deletes.
		return await ctx.db
			.query("collections")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
	},
});

export const listMembershipsByUser = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getViewerUserId(ctx);
		if (!userId) {
			return [];
		}
		return await ctx.db
			.query("collectionBooks")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
	},
});

export const createCollection = mutation({
	args: {
		name: v.string(),
		// Client-generated key: retried offline pushes create exactly one row.
		clientKey: v.string(),
		createdAt: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const userId = await requireViewerUserId(ctx);
		const name = args.name.trim();
		if (!name) {
			throw new Error("Collection name cannot be empty.");
		}
		const existing = await ctx.db
			.query("collections")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		const match = existing.find((c) => c.clientKey === args.clientKey);
		if (match) {
			return {
				id: match._id,
				serverTime: match.nameUpdatedAt ?? match.updatedAt,
			};
		}
		const now = Date.now();
		const id = await ctx.db.insert("collections", {
			userId,
			name,
			clientKey: args.clientKey,
			createdAt: args.createdAt ?? now,
			updatedAt: now,
			nameUpdatedAt: now,
		});
		return { id, serverTime: now };
	},
});

export const renameCollection = mutation({
	args: {
		collectionId: v.id("collections"),
		name: v.string(),
		baseServerTime: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const userId = await requireViewerUserId(ctx);
		const collection = await ctx.db.get(args.collectionId);
		if (!collection || collection.userId !== userId) {
			throw new Error("Collection not found.");
		}
		const currentServerTime = collection.nameUpdatedAt ?? collection.updatedAt;
		if (collection.deletedAt !== undefined) {
			return { accepted: false, serverTime: currentServerTime };
		}
		const name = args.name.trim();
		if (!name) {
			throw new Error("Collection name cannot be empty.");
		}
		if (
			args.baseServerTime !== undefined &&
			args.baseServerTime < currentServerTime
		) {
			return { accepted: false, serverTime: currentServerTime };
		}
		const now = Date.now();
		await ctx.db.patch(args.collectionId, {
			name,
			nameUpdatedAt: now,
			updatedAt: now,
		});
		return { accepted: true, serverTime: now };
	},
});

export const deleteCollection = mutation({
	args: {
		collectionId: v.id("collections"),
	},
	handler: async (ctx, args) => {
		const userId = await requireViewerUserId(ctx);
		const collection = await ctx.db.get(args.collectionId);
		if (!collection || collection.userId !== userId) {
			return;
		}
		const now = Date.now();
		// Tombstone the collection and cascade tombstones to its memberships so
		// every device's merge pass drops them (a hard delete would leave other
		// devices' local rows orphaned but alive).
		await ctx.db.patch(args.collectionId, { deletedAt: now, updatedAt: now });
		const memberships = await ctx.db
			.query("collectionBooks")
			.withIndex("by_collection", (q) =>
				q.eq("collectionId", args.collectionId),
			)
			.collect();
		for (const membership of memberships) {
			if (membership.deletedAt === undefined) {
				await ctx.db.patch(membership._id, { deletedAt: now, updatedAt: now });
			}
		}
	},
});

export const addBookToCollection = mutation({
	args: {
		collectionId: v.id("collections"),
		bookId: v.id("books"),
		clientKey: v.string(),
		createdAt: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const userId = await requireViewerUserId(ctx);
		await requireBookOwner(ctx, args.bookId);
		const collection = await ctx.db.get(args.collectionId);
		if (!collection || collection.userId !== userId) {
			throw new Error("Collection not found.");
		}
		// Deleted while this device was offline: drop the add — the client's
		// merge pass purges its local rows when it sees the tombstone.
		if (collection.deletedAt !== undefined) {
			return null;
		}
		const existing = await ctx.db
			.query("collectionBooks")
			.withIndex("by_collection", (q) =>
				q.eq("collectionId", args.collectionId),
			)
			.collect();
		const match = existing.find((m) => m.clientKey === args.clientKey);
		if (match) {
			return match._id;
		}
		const now = Date.now();
		return await ctx.db.insert("collectionBooks", {
			userId,
			collectionId: args.collectionId,
			bookId: args.bookId,
			clientKey: args.clientKey,
			createdAt: args.createdAt ?? now,
			updatedAt: now,
		});
	},
});

export const removeBookFromCollection = mutation({
	args: {
		membershipId: v.id("collectionBooks"),
	},
	handler: async (ctx, args) => {
		const userId = await requireViewerUserId(ctx);
		const membership = await ctx.db.get(args.membershipId);
		if (!membership) {
			return;
		}
		if (membership.userId !== userId) {
			throw new Error("Not authorized to modify this collection.");
		}
		await ctx.db.patch(args.membershipId, {
			deletedAt: Date.now(),
			updatedAt: Date.now(),
		});
	},
});
