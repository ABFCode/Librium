import { parse } from "@abfcode/spine";
import { bookToSpec, writeEpub } from "@abfcode/spine/write";

// Parse-modify-write: rebuild an EPUB with Librium's edited identity baked
// in, so an exported file carries the metadata you fixed (via the editor /
// NovelUpdates clipper) instead of whatever the source shipped with. As a
// side effect the output is spine's normalized EPUB3 — malformed-but-readable
// input comes out clean.

export type ExportMetadata = {
	title?: string;
	author?: string;
	series?: string;
	seriesIndex?: string;
	description?: string;
};

export type ExportCover = {
	bytes: Uint8Array;
	mediaType: string;
};

export function rewriteEpubBytes(
	bytes: Uint8Array,
	metadata: ExportMetadata,
	cover?: ExportCover,
): Uint8Array {
	const spec = bookToSpec(parse(bytes));
	// The local book row mirrors the book's full identity (import fills it,
	// edits update it, clears empty it) — so an absent field here means the
	// user CLEARED it, and the override removes the source value rather than
	// letting it survive into the export. Keep this field list in sync with
	// seedBook.ts's bookIdentityPatch (the re-seed side of the same identity).
	//
	// bookToSpec also fills the *refined* fields (titles[], structured
	// authors, descriptions[], belongs-to-collection) and the writer prefers
	// those — every override must replace both layers or the source wins.
	if (metadata.title?.trim()) {
		// Title never clears (the editor blocks empty titles).
		spec.metadata.title = metadata.title.trim();
		spec.metadata.titles = [{ value: metadata.title.trim(), type: "main" }];
	}
	// Librium stores one display string; keep it as a single creator rather
	// than guessing at how to split it.
	spec.metadata.authors = metadata.author?.trim()
		? [metadata.author.trim()]
		: undefined;
	spec.metadata.description = metadata.description?.trim() || undefined;
	spec.metadata.descriptions = metadata.description?.trim()
		? [metadata.description.trim()]
		: undefined;
	spec.metadata.series = metadata.series?.trim()
		? {
				name: metadata.series.trim(),
				...(metadata.seriesIndex?.trim()
					? { index: metadata.seriesIndex.trim() }
					: {}),
			}
		: undefined;
	spec.metadata.collections = undefined;
	if (cover && cover.bytes.length > 0) {
		// Drop the source cover from resources: leaving it would ship a stale
		// image AND collide with the writer's default cover path whenever the
		// source cover already lives there — true for any file this exporter
		// previously produced — making writeEpub throw duplicate_href and the
		// whole rewrite silently fall back to the raw copy. Also clear the
		// default target path in case an unrelated resource occupies it.
		const ext =
			cover.mediaType === "image/png"
				? "png"
				: cover.mediaType === "image/gif"
					? "gif"
					: "jpg";
		const stale = new Set(
			[spec.cover?.href, `images/cover.${ext}`].filter(Boolean),
		);
		if (spec.resources) {
			spec.resources = spec.resources.filter((r) => !stale.has(r.href));
		}
		spec.cover = { bytes: cover.bytes, mediaType: cover.mediaType };
	}
	return writeEpub(spec);
}
