import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildFixtureEpub } from "../../e2e/fixtureEpub";
import { parseEpubToPayload } from "../lib/epub";
import { rewriteEpubBytes } from "../lib/rewriteEpubCore";

const TESTBOOKS_DIR = join(__dirname, "../../../testbooks");

// Round-trip: the exported file must carry the edited identity when parsed
// back, and its content must survive the rewrite unharmed.

// 1x1 transparent PNG.
const DOT_PNG = Uint8Array.from(
	atob(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
	),
	(c) => c.charCodeAt(0),
);

describe("rewriteEpubBytes", () => {
	it("bakes edited metadata and a replaced cover into the output", () => {
		const out = rewriteEpubBytes(
			buildFixtureEpub("Mesmorize"),
			{
				title: "M E M O R I Z E",
				author: "Ro Yu-jin",
				series: "Hall Plain",
				seriesIndex: "1",
				description: "An almighty power, the Zero Code.",
			},
			{ bytes: DOT_PNG, mediaType: "image/png" },
		);
		const payload = parseEpubToPayload(out);
		expect(payload.metadata.title).toBe("M E M O R I Z E");
		expect(payload.metadata.authors).toEqual(["Ro Yu-jin"]);
		expect(payload.metadata.series).toBe("Hall Plain");
		expect(payload.metadata.seriesIndex).toBe("1");
		expect(payload.cover?.bytes.length).toBe(DOT_PNG.length);
		// Content unharmed: same chapters, same prose.
		const original = parseEpubToPayload(buildFixtureEpub("Mesmorize"));
		expect(payload.sections.length).toBe(original.sections.length);
		expect(payload.chunks.map((c) => c.content).join("")).toContain(
			"what are you doing out here",
		);
	});

	it("leaves untouched fields as the source wrote them", () => {
		const out = rewriteEpubBytes(buildFixtureEpub("Kept Title"), {});
		const payload = parseEpubToPayload(out);
		expect(payload.metadata.title).toBe("Kept Title");
		expect(payload.metadata.authors).toEqual(["E2E"]);
	});

	it.skipIf(!existsSync(TESTBOOKS_DIR))(
		"carries a real illustrated book through the writer intact",
		() => {
			const bytes = new Uint8Array(
				readFileSync(join(TESTBOOKS_DIR, "alice-se.epub")),
			);
			const out = rewriteEpubBytes(bytes, { title: "Alice, Renamed" });
			const payload = parseEpubToPayload(out);
			expect(payload.metadata.title).toBe("Alice, Renamed");
			// All 44 illustrations survive the rebuild.
			expect(payload.images.length).toBe(44);
			expect(payload.sections.length).toBeGreaterThan(10);
		},
	);
});
