import { textToEpub } from "@abfcode/spine/text";

// Plain-text/markdown → EPUB bytes (spine ≥0.9 text ingestion). The output
// rides the entire existing import pipeline unchanged — R2 backup, worker
// parse, shelf, sync, export — so a .txt webnovel rip becomes a first-class
// book. Chapter detection is spine's heuristic ruleset (Chapter N, roman,
// CJK 第N章, markdown headings, ALL-CAPS runs…), biased to under-split.

const stripExtension = (name: string) =>
	name.replace(/\.(txt|md|markdown)$/i, "");

export function convertTextToEpub(
	bytes: Uint8Array,
	fileName: string,
): Uint8Array {
	return textToEpub([{ name: stripExtension(fileName), bytes }], {
		// Gutenberg START/END banners are common in rips; stripping is guarded
		// (data-loss check + warnings) so enabling it is safe.
		stripBoilerplate: true,
		// The guard's warnings must be visible somewhere — a silently-dropped
		// data-loss warning would defeat the point of having one.
		onWarning: (warning) =>
			console.warn(`[librium] text import (${fileName}):`, warning),
	});
}
