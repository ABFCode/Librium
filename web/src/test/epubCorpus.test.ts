import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEpubToPayload } from "../lib/epub";

// Real-EPUB corpus smoke: parse the repo's testbooks through the full ingest
// pipeline. Guards the spine upgrade path — in particular that image srcs in
// blocks always match an entry in the images payload (spine ≥0.6 pre-resolves
// srcs to archive-relative paths; re-resolving them corrupts every path).

const testbook = (name: string) =>
	new Uint8Array(readFileSync(join(__dirname, "../../../testbooks", name)));

type Payload = ReturnType<typeof parseEpubToPayload>;

function collectImageSrcs(payload: Payload): string[] {
	const srcs: string[] = [];
	for (const sb of payload.sectionBlocks) {
		for (const block of sb.blocks) {
			const inlineLists = [
				block.inlines ?? [],
				block.figure?.images ?? [],
				block.figure?.caption ?? [],
				...(block.table?.rows.flatMap((r) => r.cells.map((c) => c.inlines)) ??
					[]),
			];
			for (const inlines of inlineLists) {
				for (const inline of inlines) {
					if (inline.kind === "image" && inline.src) {
						srcs.push(inline.src);
					}
				}
			}
		}
	}
	return srcs;
}

function expectCoherent(payload: Payload) {
	expect(payload.sections.length).toBeGreaterThan(0);
	expect(payload.sectionBlocks.length).toBeGreaterThan(0);
	expect(payload.chunks.length).toBeGreaterThan(0);
	// Every section has a title; orderIndexes are dense.
	payload.sections.forEach((s, i) => {
		expect(s.orderIndex).toBe(i);
		expect(s.title.length).toBeGreaterThan(0);
	});
	// The 0.6-resolution invariant: every internal image src referenced by a
	// block resolves to actual bytes in the images payload.
	const available = new Set(payload.images.map((img) => img.href));
	for (const src of collectImageSrcs(payload)) {
		if (!/^(https?:|data:|\/\/)/i.test(src)) {
			expect(available.has(src), `image src not extracted: ${src}`).toBe(true);
		}
	}
	for (const img of payload.images) {
		expect(img.bytes.length).toBeGreaterThan(0);
	}
}

describe("real-EPUB corpus (testbooks/)", () => {
	it("parses memorizeFIN.epub coherently", () => {
		const payload = parseEpubToPayload(testbook("memorizeFIN.epub"));
		expect(payload.metadata.title).toBe("Mesmorize");
		expect(payload.metadata.authors).toEqual(["Bob"]);
		// Section structure is deterministic for a fixed fixture + parser major
		// behavior; chunk counts stay loose (they track the chunker, not us).
		expect(payload.sections.length).toBe(1003);
		expect(payload.chunks.length).toBeGreaterThan(5000);
		expectCoherent(payload);
	});

	it("parses worm4.epub coherently", () => {
		const payload = parseEpubToPayload(testbook("worm4.epub"));
		expect(payload.metadata.title).toBe("Worm");
		expect(payload.sections.length).toBe(32);
		expect(payload.chunks.length).toBeGreaterThan(3000);
		expectCoherent(payload);
	});
});
