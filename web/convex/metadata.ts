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
		// Live, unsaved title/author from the edit form override the stored doc
		// so a user can fix a garbled title and re-search without saving first.
		title: v.optional(v.string()),
		author: v.optional(v.union(v.string(), v.null())),
	},
	handler: async (ctx, args): Promise<MetadataCandidate[]> => {
		const stored: ProviderQuery = await ctx.runQuery(
			internal.metadata.getSearchKeys,
			{ bookId: args.bookId },
		);
		const query: ProviderQuery = {
			isbn: stored.isbn,
			title: args.title?.trim() || stored.title,
			author:
				args.author === undefined
					? stored.author
					: (args.author?.trim() ?? undefined) || undefined,
		};
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

const PAGE_MAX_BYTES = 2 * 1024 * 1024;

// Only hosts we have a client-side parser for — this action must not become
// a generic fetch proxy (SSRF).
const PAGE_HOST_ALLOWLIST = new Set([
	"www.novelupdates.com",
	"novelupdates.com",
]);

// Hosts that must never be fetched server-side (SSRF guard) — fetch targets
// derive from provider data / user input and are attacker-influenceable.
const isPrivateHost = (hostname: string) => {
	// Drop IPv6 brackets and any trailing dot ("127.0.0.1." also resolves).
	const host = hostname
		.toLowerCase()
		.replace(/^\[|\]$/g, "")
		.replace(/\.$/, "");
	if (
		host === "localhost" ||
		host.endsWith(".local") ||
		host.endsWith(".internal") ||
		host.endsWith(".localhost")
	) {
		return true;
	}
	// Any IPv6 literal: providers and NovelUpdates use DNS hostnames, never IPv6
	// literals, so blocking the whole class costs nothing and closes loopback
	// (::1), unspecified (::), ULA (fc00::/7), link-local (fe80::/10), and
	// IPv4-mapped (::ffff:7f00:1) forms that the old dotted-decimal regexes missed.
	if (host.includes(":")) {
		return true;
	}
	return (
		/^127\./.test(host) ||
		/^10\./.test(host) ||
		/^192\.168\./.test(host) ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
		/^169\.254\./.test(host) ||
		/^0\./.test(host)
	);
};

// Fetch that re-validates every redirect hop (the SSRF guards are worthless if
// applied only to the initial URL, since redirect:"follow" would then reach a
// private host on hop 2). Returns the final non-redirect Response.
async function guardedFetch(
	rawUrl: string,
	init: RequestInit,
	opts: { allowlist?: Set<string>; maxRedirects?: number },
): Promise<Response> {
	const maxRedirects = opts.maxRedirects ?? 4;
	let current = rawUrl;
	for (let hop = 0; hop <= maxRedirects; hop++) {
		const url = new URL(current);
		if (url.protocol !== "https:") {
			throw new Error("Only https URLs may be fetched.");
		}
		if (opts.allowlist && !opts.allowlist.has(url.hostname)) {
			throw new Error("Host is not allowed.");
		}
		if (isPrivateHost(url.hostname)) {
			throw new Error("Refusing to fetch from a private host.");
		}
		const res = await fetch(url.toString(), { ...init, redirect: "manual" });
		// 3xx with a Location is a redirect we must re-validate rather than follow
		// blindly; anything else is the final response.
		if (res.status >= 300 && res.status < 400) {
			const location = res.headers.get("location");
			if (!location) {
				return res;
			}
			current = new URL(location, url).toString();
			continue;
		}
		return res;
	}
	throw new Error("Too many redirects.");
}

// Read a response body, aborting once the cap is exceeded — Content-Length is
// optional and lie-able, so it can't be the only guard.
async function readCapped(
	res: Response,
	maxBytes: number,
): Promise<Uint8Array> {
	const declared = Number(res.headers.get("content-length") ?? 0);
	if (declared > maxBytes) {
		throw new Error("Response is too large.");
	}
	const reader = res.body?.getReader();
	if (!reader) {
		const buf = new Uint8Array(await res.arrayBuffer());
		if (buf.byteLength > maxBytes) {
			throw new Error("Response is too large.");
		}
		return buf;
	}
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			throw new Error("Response is too large.");
		}
		chunks.push(value);
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}

/**
 * Best-effort fetch of a linked source page. NovelUpdates sits behind
 * Cloudflare and is known to 403 non-browser clients — that outcome is
 * expected and returned as {ok:false}, never thrown; the dialog then falls
 * back to paste-the-page, which parses identically.
 */
export const fetchPageHtml = action({
	args: {
		url: v.string(),
	},
	handler: async (
		ctx,
		args,
	): Promise<{ ok: boolean; status: number; html?: string }> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Not signed in.");
		}
		let url: URL;
		try {
			url = new URL(args.url);
		} catch {
			throw new Error("Invalid page URL.");
		}
		// The allowlist is enforced on every hop by guardedFetch below; this early
		// check just gives a clearer message for a wrong initial URL.
		if (url.protocol !== "https:" || !PAGE_HOST_ALLOWLIST.has(url.hostname)) {
			throw new Error("Only NovelUpdates pages can be fetched.");
		}
		try {
			const res = await guardedFetch(
				url.toString(),
				{
					headers: {
						// Plausible browser headers — sometimes enough to pass.
						"User-Agent":
							"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
						Accept:
							"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
						"Accept-Language": "en-US,en;q=0.9",
					},
				},
				{ allowlist: PAGE_HOST_ALLOWLIST },
			);
			if (!res.ok) {
				return { ok: false, status: res.status };
			}
			const body = await readCapped(res, PAGE_MAX_BYTES);
			return {
				ok: true,
				status: res.status,
				html: new TextDecoder().decode(body),
			};
		} catch {
			// Blocked, reset, oversized, or a redirect off-allowlist — same
			// fallback as a 403: the user pastes the page HTML instead.
			return { ok: false, status: 0 };
		}
	},
});

const COVER_MAX_BYTES = 4 * 1024 * 1024;

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
		// https-only, no private hosts, re-validated on every redirect hop.
		const res = await guardedFetch(
			url.toString(),
			{
				headers: {
					Accept: "image/*",
					"User-Agent": "Mozilla/5.0 (compatible; Librium/1.0)",
				},
			},
			{},
		);
		if (!res.ok) {
			throw new Error(`Image fetch failed (${res.status}).`);
		}
		const contentType = res.headers.get("content-type") ?? "";
		if (!contentType.startsWith("image/")) {
			throw new Error("The URL did not return an image.");
		}
		const bytes = await readCapped(res, COVER_MAX_BYTES);
		// A fresh ArrayBuffer (not the Uint8Array's shared, possibly-larger one).
		return {
			bytes: bytes.buffer.slice(
				bytes.byteOffset,
				bytes.byteOffset + bytes.byteLength,
			) as ArrayBuffer,
			contentType,
		};
	},
});
