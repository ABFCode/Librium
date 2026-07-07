import type { MetadataCandidate } from "../../convex/metadataProviders";

// NovelUpdates series-page extraction. The HTML arrives either from the
// server-side fetch (when Cloudflare lets it through) or pasted by the user
// (the reliable path — NU 403s non-browser fetchers). Parsed client-side
// with DOMParser; every field is independently optional, so a DOM change on
// their side degrades that one field instead of throwing.
//
// Selectors follow the ids community scrapers use (#editdescription,
// #showauthors, #seriesgenre) — unverified against a live page (Cloudflare
// blocks automated checks); og:* tags are the stable part and cover the
// essentials on their own.

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
