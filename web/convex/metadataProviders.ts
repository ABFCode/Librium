// Metadata providers — plain fetch clients, no Convex exports. Each returns
// candidates normalized to one shape so the client's diff/apply flow is
// provider-agnostic. Runs inside the fetchCandidates action (V8 runtime,
// fetch available).

export type ProviderQuery = {
	isbn?: string;
	title?: string;
	author?: string;
};

export type MetadataCandidate = {
	title?: string;
	author?: string;
	description?: string;
	series?: string;
	subjects?: string[];
	coverUrl?: string;
	source: "openlibrary" | "googlebooks" | "novelupdates";
	sourceUrl?: string;
};

const LIMIT = 5;

// ── Open Library (no key) ────────────────────────────────────────────────────
// Search results carry no description (that lives on the work record); the
// Google Books candidate usually fills that gap.

type OpenLibraryDoc = {
	title?: string;
	author_name?: string[];
	cover_i?: number;
	key?: string;
	subject?: string[];
};

export async function searchOpenLibrary(
	query: ProviderQuery,
): Promise<MetadataCandidate[]> {
	const params = new URLSearchParams({
		fields: "title,author_name,cover_i,key,subject",
		limit: String(LIMIT),
	});
	if (query.isbn) {
		params.set("q", `isbn:${query.isbn}`);
	} else {
		if (query.title) {
			params.set("title", query.title);
		}
		if (query.author) {
			params.set("author", query.author);
		}
	}
	const res = await fetch(
		`https://openlibrary.org/search.json?${params.toString()}`,
		{ headers: { Accept: "application/json" } },
	);
	if (!res.ok) {
		throw new Error(`Open Library search failed (${res.status})`);
	}
	const data = (await res.json()) as { docs?: OpenLibraryDoc[] };
	return (data.docs ?? []).slice(0, LIMIT).map((doc) => ({
		title: doc.title,
		author: doc.author_name?.join(", "),
		subjects: doc.subject?.slice(0, 8),
		coverUrl: doc.cover_i
			? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
			: undefined,
		source: "openlibrary" as const,
		sourceUrl: doc.key ? `https://openlibrary.org${doc.key}` : undefined,
	}));
}

// ── Google Books (GOOGLE_BOOKS_API_KEY) ──────────────────────────────────────

type GoogleVolume = {
	volumeInfo?: {
		title?: string;
		authors?: string[];
		description?: string;
		categories?: string[];
		imageLinks?: { thumbnail?: string };
		canonicalVolumeLink?: string;
	};
};

export async function searchGoogleBooks(
	query: ProviderQuery,
	apiKey: string,
): Promise<MetadataCandidate[]> {
	const q = query.isbn
		? `isbn:${query.isbn}`
		: [
				query.title ? `intitle:${query.title}` : "",
				query.author ? `inauthor:${query.author}` : "",
			]
				.filter(Boolean)
				.join("+");
	const params = new URLSearchParams({
		q,
		maxResults: String(LIMIT),
		key: apiKey,
	});
	const res = await fetch(
		`https://www.googleapis.com/books/v1/volumes?${params.toString()}`,
		{ headers: { Accept: "application/json" } },
	);
	if (!res.ok) {
		throw new Error(`Google Books search failed (${res.status})`);
	}
	const data = (await res.json()) as { items?: GoogleVolume[] };
	return (data.items ?? []).slice(0, LIMIT).map(({ volumeInfo: info }) => ({
		title: info?.title,
		author: info?.authors?.join(", "),
		description: info?.description,
		subjects: info?.categories?.slice(0, 8),
		// Thumbnails come back http:// — browsers block that from an https app.
		coverUrl: info?.imageLinks?.thumbnail?.replace(/^http:/, "https:"),
		source: "googlebooks" as const,
		sourceUrl: info?.canonicalVolumeLink,
	}));
}
