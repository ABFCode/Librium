import { describe, expect, it } from "vitest";
import { blockToText, inlinesToText } from "../lib/blockText";

describe("blockToText", () => {
	it("respects the runs' own spacing without injecting gaps", () => {
		// Inline runs carry their own separator spaces (spine ≥0.1.1)…
		expect(
			blockToText({
				kind: "paragraph",
				inlines: [
					{ kind: "text", text: "what " },
					{ kind: "text", text: "are", emph: true },
					{ kind: "text", text: " you" },
				],
			}),
		).toBe("what are you");
		// …so a styled run inside punctuation must not grow spaces around it.
		expect(
			blockToText({
				kind: "paragraph",
				inlines: [
					{ kind: "text", text: "(" },
					{ kind: "text", text: "sic", emph: true },
					{ kind: "text", text: ")" },
				],
			}),
		).toBe("(sic)");
	});

	it("uses image alt text", () => {
		expect(
			blockToText({
				kind: "paragraph",
				inlines: [
					{ kind: "text", text: "see" },
					{ kind: "image", src: "x.png", alt: "a map" },
				],
			}),
		).toBe("see a map");
	});

	it("flattens tables row by row", () => {
		expect(
			blockToText({
				kind: "table",
				table: {
					rows: [
						{
							cells: [
								{ inlines: [{ kind: "text", text: "a" }] },
								{ inlines: [{ kind: "text", text: "b" }] },
							],
						},
						{ cells: [{ inlines: [{ kind: "text", text: "c" }] }] },
					],
				},
			}),
		).toBe("a b\nc");
	});

	it("prefers figure captions, falls back to image alts", () => {
		expect(
			blockToText({
				kind: "figure",
				figure: {
					images: [{ kind: "image", alt: "alt text" }],
					caption: [{ kind: "text", text: "the caption" }],
				},
			}),
		).toBe("the caption");
		expect(
			blockToText({
				kind: "figure",
				figure: {
					images: [{ kind: "image", alt: "alt text" }],
					caption: [],
				},
			}),
		).toBe("alt text");
	});

	it("returns empty string for empty inlines", () => {
		expect(blockToText({ kind: "paragraph" })).toBe("");
		expect(inlinesToText([])).toBe("");
	});
});
