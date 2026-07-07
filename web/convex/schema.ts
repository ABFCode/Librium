import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Blobs live in Cloudflare R2 (raw EPUB + cover only — ROADMAP Phase 5).
// Parsed content is derived data: devices re-parse the EPUB locally, so there
// are no section/asset tables server-side. Convex holds auth, book metadata,
// and the tiny sync plane (progress, bookmarks).

const users = defineTable({
	authProvider: v.string(),
	externalId: v.string(),
	email: v.optional(v.string()),
	name: v.optional(v.string()),
	createdAt: v.number(),
}).index("by_external_id", ["authProvider", "externalId"]);

const books = defineTable({
	ownerId: v.id("users"),
	title: v.string(),
	author: v.optional(v.string()),
	language: v.optional(v.string()),
	publisher: v.optional(v.string()),
	publishedAt: v.optional(v.string()),
	series: v.optional(v.string()),
	seriesIndex: v.optional(v.string()),
	subjects: v.optional(v.array(v.string())),
	description: v.optional(v.string()),
	// Linked source page (e.g. a NovelUpdates series URL) — set by the user,
	// used for "Open source page" and page-based metadata fetch.
	sourceUrl: v.optional(v.string()),
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
	sectionCount: v.optional(v.number()),
	// R2 object keys. epubKey is the master copy (device seeding + download);
	// set by attachFiles once the client upload completes.
	epubKey: v.optional(v.string()),
	coverKey: v.optional(v.string()),
	// Bumped whenever coverKey is (re)attached — the R2 key never changes on
	// replacement, so this is how other devices detect a stale local cover.
	coverUpdatedAt: v.optional(v.number()),
	fileName: v.optional(v.string()),
	fileSize: v.optional(v.number()),
	createdAt: v.number(),
	updatedAt: v.number(),
}).index("by_owner", ["ownerId", "updatedAt"]);

const userBooks = defineTable({
	userId: v.id("users"),
	bookId: v.id("books"),
	lastSectionIndex: v.number(),
	lastBlockIndex: v.optional(v.number()),
	// Fraction (0–1) within the anchor block (layout-independent).
	lastBlockOffset: v.optional(v.number()),
	// Fraction (0–1) through the whole section — lets percent displays count
	// partial chapters (completed + fraction) instead of whole chapters only.
	lastSectionFraction: v.optional(v.number()),
	updatedAt: v.number(),
	// Client edit time of the progress fields (device clock, same-user devices).
	// Used to reject stale offline pushes; pull ordering uses updatedAt (server).
	progressEditedAt: v.optional(v.number()),
	// Explicit reading status; absent = derived from progress on the client.
	// Own LWW clock, disjoint from progressEditedAt — status and progress are
	// edited independently and must never clobber each other.
	status: v.optional(
		v.union(
			v.literal("reading"),
			v.literal("finished"),
			v.literal("want"),
			v.literal("abandoned"),
		),
	),
	statusEditedAt: v.optional(v.number()),
})
	.index("by_user_book", ["userId", "bookId"])
	.index("by_user_updated", ["userId", "updatedAt"])
	.index("by_book", ["bookId"]);

const userSettings = defineTable({
	userId: v.id("users"),
	fontScale: v.number(),
	lineHeight: v.number(),
	contentWidth: v.number(),
	theme: v.string(),
	// Reading font: "sans" (default) or "serif". Optional for pre-existing rows.
	fontFamily: v.optional(v.string()),
	updatedAt: v.number(),
}).index("by_user", ["userId"]);

// User-named book groups (many-to-many via collectionBooks). Same offline
// sync plane as bookmarks: client-generated clientKey for idempotent offline
// creates, deletedAt tombstones so deletes propagate across devices.
const collections = defineTable({
	userId: v.id("users"),
	name: v.string(),
	clientKey: v.string(),
	createdAt: v.number(),
	updatedAt: v.number(),
	deletedAt: v.optional(v.number()),
	// LWW clock for offline renames (device clock, same-user devices).
	nameEditedAt: v.optional(v.number()),
}).index("by_user", ["userId", "updatedAt"]);

const collectionBooks = defineTable({
	userId: v.id("users"),
	collectionId: v.id("collections"),
	bookId: v.id("books"),
	clientKey: v.string(),
	createdAt: v.number(),
	updatedAt: v.number(),
	deletedAt: v.optional(v.number()),
})
	.index("by_user", ["userId", "updatedAt"])
	.index("by_collection", ["collectionId"])
	.index("by_book", ["bookId"]);

const bookmarks = defineTable({
	userId: v.id("users"),
	bookId: v.id("books"),
	sectionIndex: v.number(),
	blockIndex: v.number(),
	offset: v.number(),
	label: v.optional(v.string()),
	createdAt: v.number(),
	// Sync (ROADMAP Phase 4): client-generated key for idempotent offline
	// creates; deletedAt is a tombstone so deletes propagate instead of
	// resurrecting on other devices. TODO: compact old tombstones eventually.
	clientKey: v.optional(v.string()),
	updatedAt: v.optional(v.number()),
	deletedAt: v.optional(v.number()),
})
	.index("by_user_book", ["userId", "bookId"])
	.index("by_book", ["bookId"]);

export default defineSchema({
	users,
	books,
	userBooks,
	userSettings,
	bookmarks,
	collections,
	collectionBooks,
});
