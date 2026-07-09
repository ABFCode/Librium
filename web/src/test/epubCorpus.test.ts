import { existsSync } from "node:fs";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseEpubToPayload } from "../lib/epub";
import { DOT_PNG, TESTBOOKS_DIR, testbook } from "./corpusFixtures";

// Corpus smoke: parse EPUBs through the full ingest pipeline. Guards the
// spine upgrade path — in particular that image srcs in blocks always match
// an entry in the images payload (spine ≥0.6 pre-resolves srcs to
// archive-relative paths; re-resolving them corrupts every path).
//
// Two tiers: a synthetic image-bearing EPUB that always runs (CI included),
// and the real testbooks/ novels — copyrighted files deliberately absent
// from the public repo, so those tests run only where the directory exists
// (dev machines).

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

// Minimal EPUB whose chapter references an image via a RELATIVE src from a
// nested directory — the exact shape that breaks if the pipeline ever
// re-resolves spine's already-resolved srcs again (double-join).
function buildImageEpub(): Uint8Array {
	const opf = `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:uuid:img-fixture</dc:identifier><dc:title>Image Fixture</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta></metadata><manifest><item id="nav" href="text/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="text/c1.xhtml" media-type="application/xhtml+xml"/><item id="dot" href="images/dot.png" media-type="image/png"/></manifest><spine><itemref idref="c1"/></spine></package>`;
	return zipSync({
		mimetype: [strToU8("application/epub+zip"), { level: 0 }],
		"META-INF/container.xml": strToU8(
			`<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
		),
		"OEBPS/content.opf": strToU8(opf),
		"OEBPS/text/nav.xhtml": strToU8(
			`<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="c1.xhtml">One</a></li></ol></nav></body></html>`,
		),
		"OEBPS/text/c1.xhtml": strToU8(
			`<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>One</title></head><body><h1>One</h1><p>Before the image.</p><p><img src="../images/dot.png" alt="a dot"/></p></body></html>`,
		),
		"OEBPS/images/dot.png": DOT_PNG,
	});
}

describe("synthetic image EPUB (always runs)", () => {
	it("resolves a nested relative image src to extracted bytes", () => {
		const payload = parseEpubToPayload(buildImageEpub());
		expect(payload.metadata.title).toBe("Image Fixture");
		const srcs = collectImageSrcs(payload);
		expect(srcs).toEqual(["OEBPS/images/dot.png"]);
		expect(payload.images.map((img) => img.href)).toEqual([
			"OEBPS/images/dot.png",
		]);
		expect(payload.images[0].bytes.length).toBe(DOT_PNG.length);
		expectCoherent(payload);
	});
});

// Copyrighted real books — absent from the public repo, present on dev
// machines. CI covers the same invariants via the synthetic fixture above.
describe.skipIf(!existsSync(TESTBOOKS_DIR))(
	"real-EPUB corpus (testbooks/)",
	() => {
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

		// Standard Ebooks' Alice (public domain, Tenniel illustrations) — the
		// corpus' genuinely illustrated book: 42 inline plates referenced from
		// nested chapter files, ~10MB of image bytes through the pipeline.
		it("parses alice-se.epub with all illustrations extracted", () => {
			const payload = parseEpubToPayload(testbook("alice-se.epub"));
			expect(payload.metadata.title).toBe("Alice’s Adventures in Wonderland");
			expect(payload.metadata.authors).toEqual(["Lewis Carroll"]);
			expect(payload.sections.length).toBe(20);
			expect(payload.images.length).toBe(44);
			const totalImageBytes = payload.images.reduce(
				(n, img) => n + img.bytes.length,
				0,
			);
			expect(totalImageBytes).toBeGreaterThan(9_000_000);
			expect(payload.cover?.contentType).toBe("image/jpeg");
			expectCoherent(payload);
		});
	},
);
