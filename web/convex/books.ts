import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
	action,
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import {
	getViewerUserId,
	requireBookOwner,
	requireViewerUserId,
} from "./authHelpers";
import {
	assertWithinQuota,
	attachedUsageBytes,
	getPlanAndLimit,
	MAX_COVER_BYTES,
	quotaEnforced,
} from "./quota";
import { r2 } from "./r2";

const metadataSchema = v.object({
	title: v.string(),
	author: v.optional(v.string()),
	language: v.optional(v.string()),
	publisher: v.optional(v.string()),
	publishedAt: v.optional(v.string()),
	series: v.optional(v.string()),
	seriesIndex: v.optional(v.string()),
	subjects: v.optional(v.array(v.string())),
	identifiers: v.optional(
		v.array(
			v.object({
				id: v.string(),
				scheme: v.string(),
				value: v.string(),
				type: v.string(),
			}),
		),
	),
});

/**
 * Register an imported book (metadata only — the client has already parsed it
 * locally). Blob uploads to R2 happen after this and land via attachFiles, so
 * the book is readable on the importing device before any upload completes.
 */
export const registerImport = mutation({
	args: {
		fileName: v.string(),
		fileSize: v.number(),
		sectionCount: v.number(),
		metadata: metadataSchema,
	},
	handler: async (ctx, args) => {
		const userId = await requireViewerUserId(ctx);
		// Declared size is client input — sanity it before it can poison the
		// usage accounting (finalizeUpload later replaces it with the size R2
		// actually reports).
		if (!Number.isFinite(args.fileSize) || args.fileSize < 0) {
			throw new Error("Invalid file size.");
		}
		// Fast-fail courtesy check on the declared size, so an over-quota
		// import dies here (clear error, nothing created) instead of after a
		// full upload. The authoritative check is in finalizeUpload.
		await assertWithinQuota(ctx, userId, args.fileSize);
		const now = Date.now();
		const m = args.metadata;
		const bookId = await ctx.db.insert("books", {
			ownerId: userId,
			title: m.title || args.fileName.replace(/\.epub$/i, ""),
			author: m.author,
			language: m.language,
			publisher: m.publisher,
			publishedAt: m.publishedAt,
			series: m.series,
			seriesIndex: m.seriesIndex,
			subjects: m.subjects,
			identifiers: m.identifiers,
			sectionCount: args.sectionCount,
			fileName: args.fileName,
			fileSize: args.fileSize,
			createdAt: now,
			updatedAt: now,
		});
		await ctx.db.insert("userBooks", {
			userId,
			bookId,
			lastSectionIndex: 0,
			updatedAt: now,
			// A freshly imported book is recent.
			lastActivityAt: now,
		});
		return bookId;
	},
});

/**
 * Signed R2 upload URL with a structured key (books/{bookId}/…) so the
 * bucket stays debuggable — each book's objects live under one prefix.
 */
export const generateBookUploadUrl = mutation({
	args: {
		bookId: v.id("books"),
		kind: v.union(v.literal("epub"), v.literal("cover")),
	},
	handler: async (ctx, args) => {
		await requireBookOwner(ctx, args.bookId);
		const key =
			args.kind === "epub"
				? `books/${args.bookId}/book.epub`
				: `books/${args.bookId}/cover`;
		return await r2.generateUploadUrl(key);
	},
});

/**
 * Legacy attach path (no size verification) — kept so frontends deployed
 * before finalizeUpload keep importing during the transition. Once quota
 * enforcement is on, this would be a trivial bypass (attach without the
 * verified-size check), so it refuses instead.
 */
export const attachFiles = mutation({
	args: {
		bookId: v.id("books"),
		epubKey: v.optional(v.string()),
		coverKey: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		if (quotaEnforced()) {
			throw new ConvexError({
				code: "update_required" as const,
				message: "Please reload Librium to finish this import.",
			});
		}
		await requireBookOwner(ctx, args.bookId);
		// Bind the keys to this book's own prefix. Without this an owner could
		// attach another book's key (books/{otherId}/…) and then read that
		// object via getEpubUrl/getCoverUrls, which only re-check row ownership.
		const prefix = `books/${args.bookId}/`;
		if (args.epubKey && args.epubKey !== `${prefix}book.epub`) {
			throw new Error("epubKey does not belong to this book.");
		}
		if (args.coverKey && args.coverKey !== `${prefix}cover`) {
			throw new Error("coverKey does not belong to this book.");
		}
		const now = Date.now();
		await ctx.db.patch(args.bookId, {
			...(args.epubKey ? { epubKey: args.epubKey } : {}),
			// The cover's R2 key is fixed (books/{id}/cover), so replacing the
			// image doesn't change coverKey — coverUpdatedAt is what tells other
			// devices their cached cover blob is stale.
			...(args.coverKey
				? { coverKey: args.coverKey, coverUpdatedAt: now }
				: {}),
			updatedAt: now,
		});
		// Server time of the cover attach — the client stamps its local blob
		// with this (not its own clock) so staleness comparisons stay on one
		// clock.
		return args.coverKey ? now : null;
	},
});

export const assertBookOwner = internalQuery({
	args: { bookId: v.id("books") },
	handler: async (ctx, args) => {
		await requireBookOwner(ctx, args.bookId);
		return null;
	},
});

/**
 * Attach one uploaded object with its VERIFIED size, enforcing quota
 * transactionally (Convex mutations are serializable, so two concurrent
 * finalizes can't both squeeze under the limit). Returns a rejection value
 * instead of throwing so bookkeeping (e.g. unsetting a dangling coverKey)
 * commits — the caller deletes the R2 object and surfaces the error.
 */
export const attachVerified = internalMutation({
	args: {
		bookId: v.id("books"),
		kind: v.union(v.literal("epub"), v.literal("cover")),
		verifiedSize: v.number(),
	},
	handler: async (
		ctx,
		args,
	): Promise<
		| { ok: true; coverStamp: number | null }
		| {
				ok: false;
				code: "quota_exceeded" | "cover_too_large";
				usedBytes?: number;
				limitBytes?: number;
		  }
	> => {
		const { viewerId } = await requireBookOwner(ctx, args.bookId);
		const now = Date.now();
		if (args.kind === "cover") {
			if (args.verifiedSize > MAX_COVER_BYTES) {
				// The upload already overwrote the fixed-key object, so any
				// previous cover is gone regardless; unset the key so the book
				// falls back to the no-cover state instead of dangling.
				await ctx.db.patch(args.bookId, {
					coverKey: undefined,
					coverUpdatedAt: undefined,
					updatedAt: now,
				});
				return { ok: false, code: "cover_too_large" };
			}
			await ctx.db.patch(args.bookId, {
				coverKey: `books/${args.bookId}/cover`,
				coverUpdatedAt: now,
				updatedAt: now,
			});
			return { ok: true, coverStamp: now };
		}
		// EPUB: quota is the attached (verified) bytes, excluding this book so
		// a re-finalize replaces rather than double-counts its own size.
		const { enforced, limitBytes } = await getPlanAndLimit(ctx, viewerId);
		const used = await attachedUsageBytes(ctx, viewerId, args.bookId);
		if (enforced && used + args.verifiedSize > limitBytes) {
			return {
				ok: false,
				code: "quota_exceeded",
				usedBytes: used,
				limitBytes,
			};
		}
		await ctx.db.patch(args.bookId, {
			epubKey: `books/${args.bookId}/book.epub`,
			// Replace the client-declared size with what R2 actually stores —
			// the accounting must describe reality. (book.fileName keeps the
			// source file's name as provenance.)
			fileSize: args.verifiedSize,
			updatedAt: now,
		});
		return { ok: true, coverStamp: null };
	},
});

/**
 * Post-upload verification + attach: HEAD the object in R2 for its true
 * size, then attach transactionally. An upload that fails verification is
 * deleted from R2 — the importing device's local copy is untouched, and no
 * existing attached book is ever affected.
 */
export const finalizeUpload = action({
	args: {
		bookId: v.id("books"),
		kind: v.union(v.literal("epub"), v.literal("cover")),
	},
	handler: async (ctx, args): Promise<number | null> => {
		// Ownership first — a non-owner shouldn't even trigger a HEAD of
		// someone else's object (attachVerified re-checks transactionally).
		await ctx.runQuery(internal.books.assertBookOwner, {
			bookId: args.bookId,
		});
		const key =
			args.kind === "epub"
				? `books/${args.bookId}/book.epub`
				: `books/${args.bookId}/cover`;
		// Sync pulls the object's real metadata from R2 into the component's
		// index; without a successful upload there's nothing to attach.
		await r2.syncMetadata(ctx, key);
		const meta = await r2.getMetadata(ctx, key);
		const size = meta?.size;
		if (typeof size !== "number" || !Number.isFinite(size) || size < 0) {
			throw new Error("Upload verification failed — please retry.");
		}
		const result = await ctx.runMutation(internal.books.attachVerified, {
			bookId: args.bookId,
			kind: args.kind,
			verifiedSize: size,
		});
		if (!result.ok) {
			// Rejected uploads don't get to occupy the bucket.
			await r2.deleteObject(ctx, key);
			throw new ConvexError(
				result.code === "quota_exceeded"
					? {
							code: "quota_exceeded" as const,
							usedBytes: result.usedBytes,
							limitBytes: result.limitBytes,
						}
					: { code: "cover_too_large" as const },
			);
		}
		return result.coverStamp;
	},
});

export const listByOwner = query({
	args: {},
	handler: async (ctx) => {
		const ownerId = await getViewerUserId(ctx);
		if (!ownerId) {
			return [];
		}
		return await ctx.db
			.query("books")
			.withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
			.order("desc")
			.collect();
	},
});

// Graceful single-book lookup: null when missing or not owned — never throws.
// Clients use null as the definitive "deleted elsewhere" signal.
export const getBook = query({
	args: {
		bookId: v.id("books"),
	},
	handler: async (ctx, args) => {
		const viewerId = await getViewerUserId(ctx);
		if (!viewerId) {
			return null;
		}
		const book = await ctx.db.get(args.bookId);
		if (!book || book.ownerId !== viewerId) {
			return null;
		}
		return book;
	},
});

/**
 * Signed R2 URL for the raw EPUB — device seeding (download → re-parse →
 * IndexedDB) and the library download button.
 */
export const getEpubUrl = query({
	args: {
		bookId: v.id("books"),
	},
	handler: async (ctx, args) => {
		const viewerId = await getViewerUserId(ctx);
		if (!viewerId) {
			return null;
		}
		const book = await ctx.db.get(args.bookId);
		if (!book || book.ownerId !== viewerId || !book.epubKey) {
			return null;
		}
		return await r2.getUrl(book.epubKey, { expiresIn: 60 * 60 });
	},
});

export const getCoverUrls = query({
	args: {
		bookIds: v.array(v.id("books")),
	},
	handler: async (ctx, args) => {
		const viewerId = await getViewerUserId(ctx);
		if (!viewerId) {
			return {};
		}
		const result: Record<string, string> = {};
		for (const bookId of args.bookIds) {
			const book = await ctx.db.get(bookId);
			if (!book || book.ownerId !== viewerId || !book.coverKey) {
				continue;
			}
			result[bookId] = await r2.getUrl(book.coverKey, { expiresIn: 60 * 60 });
		}
		return result;
	},
});

export const deleteBookData = internalMutation({
	args: {
		bookId: v.id("books"),
	},
	handler: async (ctx, args) => {
		const { book } = await requireBookOwner(ctx, args.bookId);
		const userBooks = await ctx.db
			.query("userBooks")
			.withIndex("by_book", (q) => q.eq("bookId", args.bookId))
			.collect();
		for (const entry of userBooks) {
			await ctx.db.delete(entry._id);
		}
		const bookmarks = await ctx.db
			.query("bookmarks")
			.withIndex("by_book", (q) => q.eq("bookId", args.bookId))
			.collect();
		for (const bookmark of bookmarks) {
			await ctx.db.delete(bookmark._id);
		}
		// Hard delete (like bookmarks): other devices purge their local copies
		// when the membership's convexId vanishes from the remote list.
		const memberships = await ctx.db
			.query("collectionBooks")
			.withIndex("by_book", (q) => q.eq("bookId", args.bookId))
			.collect();
		for (const membership of memberships) {
			await ctx.db.delete(membership._id);
		}
		await ctx.db.delete(args.bookId);
		return { epubKey: book.epubKey, coverKey: book.coverKey };
	},
});

/**
 * Delete a book: rows in one mutation (content tables no longer exist, so no
 * batching needed), then the R2 objects.
 */
export const deleteBook = action({
	args: {
		bookId: v.id("books"),
	},
	handler: async (ctx, args) => {
		const { epubKey, coverKey } = await ctx.runMutation(
			internal.books.deleteBookData,
			{ bookId: args.bookId },
		);
		if (epubKey) {
			await r2.deleteObject(ctx, epubKey);
		}
		if (coverKey) {
			await r2.deleteObject(ctx, coverKey);
		}
	},
});
