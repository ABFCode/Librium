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
	// bookToSpec fills the *refined* fields (titles[], structured authors,
	// descriptions[]) and the writer prefers those — an override must replace
	// both layers or the source values win.
	if (metadata.title?.trim()) {
		spec.metadata.title = metadata.title.trim();
		spec.metadata.titles = [{ value: metadata.title.trim(), type: "main" }];
	}
	if (metadata.author?.trim()) {
		// Librium stores one display string; keep it as a single creator rather
		// than guessing at how to split it.
		spec.metadata.authors = [metadata.author.trim()];
	}
	if (metadata.description?.trim()) {
		spec.metadata.description = metadata.description.trim();
		spec.metadata.descriptions = [metadata.description.trim()];
	}
	if (metadata.series?.trim()) {
		spec.metadata.series = {
			name: metadata.series.trim(),
			...(metadata.seriesIndex?.trim()
				? { index: metadata.seriesIndex.trim() }
				: {}),
		};
		// The refined belongs-to-collection entries would shadow the override.
		spec.metadata.collections = undefined;
	}
	if (cover && cover.bytes.length > 0) {
		spec.cover = { bytes: cover.bytes, mediaType: cover.mediaType };
	}
	return writeEpub(spec);
}
