import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery, mutation } from "./_generated/server";
import { requireBookOwner } from "./authHelpers";
import {
	type MetadataCandidate,
	type ProviderQuery,
	searchGoogleBooks,
	searchOpenLibrary,
} from "./metadataProviders";

// User-edited book metadata. Online-only by design (the books table is
// server-authoritative); the client mirrors accepted edits into its local
// shelf row. Every field is optional: absent = unchanged, null = clear.

export const updateBookMetadata = mutation({
	args: {
		bookId: v.id("books"),
		// Title is required on books — it can change but never clear.
		title: v.optional(v.string()),
		author: v.optional(v.union(v.string(), v.null())),
		series: v.optional(v.union(v.string(), v.null())),
		seriesIndex: v.optional(v.union(v.string(), v.null())),
		description: v.optional(v.union(v.string(), v.null())),
		language: v.optional(v.union(v.string(), v.null())),
		sourceUrl: v.optional(v.union(v.string(), v.null())),
		subjects: v.optional(v.union(v.array(v.string()), v.null())),
	},
	handler: async (ctx, args) => {
		await requireBookOwner(ctx, args.bookId);
		const { bookId, title, ...rest } = args;
		if (title !== undefined && title.trim().length === 0) {
			throw new Error("Title cannot be empty.");
		}
		const patch: Record<string, unknown> = {};
		if (title !== undefined) {
			patch.title = title.trim();
		}
		for (const [field, value] of Object.entries(rest)) {
			if (value === undefined) {
				continue;
			}
			// null → undefined: a Convex patch removes fields set to undefined.
			patch[field] = value ?? undefined;
		}
		patch.updatedAt = Date.now();
		await ctx.db.patch(bookId, patch);
	},
});

// Search keys for provider lookups — ownership-checked so the public action
// can't be used to probe other users' books.
export const getSearchKeys = internalQuery({
	args: {
		bookId: v.id("books"),
	},
	handler: async (ctx, args) => {
		const { book } = await requireBookOwner(ctx, args.bookId);
		// Prefer a real ISBN identifier; fall back to any identifier value that
		// looks like an ISBN-13 once hyphens are stripped.
		let isbn: string | undefined;
		for (const identifier of book.identifiers ?? []) {
			const value = identifier.value.replace(/-/g, "").trim();
			if (/isbn/i.test(identifier.scheme) && /^\d{9,13}[\dX]?$/i.test(value)) {
				isbn = value;
				break;
			}
			if (!isbn && /^97[89]\d{10}$/.test(value)) {
				isbn = value;
			}
		}
		return { isbn, title: book.title, author: book.author ?? undefined };
	},
});

/**
 * User-triggered metadata search across providers. Never applies anything —
 * the client shows candidates and a per-field diff; the user picks what to
 * keep and the dialog's Save writes it via updateBookMetadata.
 */
export const fetchCandidates = action({
	args: {
		bookId: v.id("books"),
	},
	handler: async (ctx, args): Promise<MetadataCandidate[]> => {
		const query: ProviderQuery = await ctx.runQuery(
			internal.metadata.getSearchKeys,
			{ bookId: args.bookId },
		);
		const searches: Promise<MetadataCandidate[]>[] = [searchOpenLibrary(query)];
		// Optional provider: silently skipped when the key isn't configured.
		const googleKey = process.env.GOOGLE_BOOKS_API_KEY;
		if (googleKey) {
			searches.push(searchGoogleBooks(query, googleKey));
		}
		const settled = await Promise.allSettled(searches);
		const candidates = settled
			.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
			// A candidate with no title can't be matched by eye — drop it.
			.filter((candidate) => candidate.title);
		return candidates.slice(0, 8);
	},
});

const COVER_MAX_BYTES = 4 * 1024 * 1024;

// Hosts that must never be fetched server-side (SSRF guard) — the cover URL
// comes from provider data but is ultimately attacker-influenceable input.
const isPrivateHost = (hostname: string) => {
	const host = hostname.toLowerCase();
	return (
		host === "localhost" ||
		host.endsWith(".local") ||
		host.endsWith(".internal") ||
		host === "::1" ||
		host === "[::1]" ||
		/^127\./.test(host) ||
		/^10\./.test(host) ||
		/^192\.168\./.test(host) ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
		/^169\.254\./.test(host) ||
		/^0\./.test(host)
	);
};

/**
 * Proxy a candidate's cover image to the client — image hosts rarely send
 * CORS headers, so the browser can't fetch them directly. The client turns
 * the bytes into a Blob and reuses the normal cover-upload path (R2 +
 * local coverBlob).
 */
export const fetchCoverImage = action({
	args: {
		url: v.string(),
	},
	handler: async (
		ctx,
		args,
	): Promise<{ bytes: ArrayBuffer; contentType: string }> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Not signed in.");
		}
		let url: URL;
		try {
			url = new URL(args.url);
		} catch {
			throw new Error("Invalid image URL.");
		}
		if (url.protocol !== "https:") {
			throw new Error("Cover URLs must be https.");
		}
		if (isPrivateHost(url.hostname)) {
			throw new Error("Refusing to fetch from a private host.");
		}
		const res = await fetch(url.toString(), {
			headers: {
				Accept: "image/*",
				"User-Agent": "Mozilla/5.0 (compatible; Librium/1.0)",
			},
			redirect: "follow",
		});
		if (!res.ok) {
			throw new Error(`Image fetch failed (${res.status}).`);
		}
		const contentType = res.headers.get("content-type") ?? "";
		if (!contentType.startsWith("image/")) {
			throw new Error("The URL did not return an image.");
		}
		const declared = Number(res.headers.get("content-length") ?? 0);
		if (declared > COVER_MAX_BYTES) {
			throw new Error("Cover image is too large (4 MB max).");
		}
		const bytes = await res.arrayBuffer();
		if (bytes.byteLength > COVER_MAX_BYTES) {
			throw new Error("Cover image is too large (4 MB max).");
		}
		return { bytes, contentType };
	},
});
