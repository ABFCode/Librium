import type { MetadataCandidate } from "../../convex/metadataProviders";

// NovelUpdates series-page extraction. The HTML arrives either from the
// server-side fetch (when Cloudflare lets it through) or pasted by the user
// (the reliable path — NU 403s non-browser fetchers). Parsed client-side
// with DOMParser; every field is independently optional, so a DOM change on
// their side degrades that one field instead of throwing.
//
// Selectors follow the ids community scrapers use (#editdescription,
// #showauthors, #seriesgenre). The representative test fixture is entirely
// synthetic; it preserves this public selector contract without retaining a
// captured third-party page or its user-generated content. og:* tags are the
// stable part and cover the essentials on their own.

export function isNovelUpdatesUrl(raw: string): boolean {
	try {
		const url = new URL(raw);
		return (
			(url.hostname === "www.novelupdates.com" ||
				url.hostname === "novelupdates.com") &&
			url.pathname.startsWith("/series/")
		);
	} catch {
		return false;
	}
}

// Clipboard payload produced by the companion browser extension
// (extension/): right-click → "Copy to Librium" on a NU series page copies
// the page HTML plus the cover (as a data URL — screenshot-cropped from the
// rendered page, since both fetch paths are blocked; see extension/README)
// as one JSON blob. `librium: 1` is the contract version; bump it and branch
// here if the shape ever changes. The extension may also attach a
// diagnostic-only `coverError` field, which the app ignores.
export type LibriumNuPayload = {
	sourceUrl: string;
	html: string;
	coverDataUrl?: string;
};

export function parseLibriumPayload(text: string): LibriumNuPayload | null {
	if (!text.startsWith("{")) {
		return null;
	}
	let obj: unknown;
	try {
		obj = JSON.parse(text);
	} catch {
		return null;
	}
	if (typeof obj !== "object" || obj === null) {
		return null;
	}
	const payload = obj as Record<string, unknown>;
	if (
		payload.librium !== 1 ||
		typeof payload.html !== "string" ||
		typeof payload.sourceUrl !== "string" ||
		!isNovelUpdatesUrl(payload.sourceUrl)
	) {
		return null;
	}
	const coverDataUrl =
		typeof payload.coverDataUrl === "string" &&
		payload.coverDataUrl.startsWith("data:image/")
			? payload.coverDataUrl
			: undefined;
	return { sourceUrl: payload.sourceUrl, html: payload.html, coverDataUrl };
}

// Base64 image data URL → Blob (null on anything malformed). Tolerates media
// type parameters (";charset=…") but drops them from the Blob type.
export function dataUrlToBlob(dataUrl: string): Blob | null {
	const match =
		/^data:(image\/[\w.+-]+)(?:;[\w.+-]+=[^;,]*)*;base64,([A-Za-z0-9+/=]*)$/.exec(
			dataUrl,
		);
	if (!match) {
		return null;
	}
	try {
		const binary = atob(match[2]);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return new Blob([bytes], { type: match[1] });
	} catch {
		return null;
	}
}

const meta = (doc: Document, property: string): string | undefined => {
	const content = doc
		.querySelector(`meta[property="${property}"]`)
		?.getAttribute("content")
		?.trim();
	return content || undefined;
};

const texts = (doc: Document, selector: string): string[] => {
	try {
		return [...doc.querySelectorAll(selector)]
			.map((el) => el.textContent?.trim() ?? "")
			.filter(Boolean);
	} catch {
		return [];
	}
};

export function parseNovelUpdatesHtml(
	html: string,
	sourceUrl: string,
): MetadataCandidate {
	const doc = new DOMParser().parseFromString(html, "text/html");

	const title = meta(doc, "og:title")?.replace(/\s*-\s*Novel Updates\s*$/i, "");
	const coverUrl = meta(doc, "og:image")?.replace(/^http:/, "https:");

	// The description block; og:description is a truncated fallback.
	const descriptionNode = doc.querySelector("#editdescription");
	const description =
		descriptionNode?.textContent?.trim() || meta(doc, "og:description");

	const authors = texts(doc, "#showauthors a");
	const genres = texts(doc, "#seriesgenre a");

	return {
		title: title || undefined,
		author: authors.length > 0 ? authors.join(", ") : undefined,
		description: description || undefined,
		subjects: genres.length > 0 ? genres.slice(0, 10) : undefined,
		coverUrl,
		source: "novelupdates",
		sourceUrl,
	};
}
