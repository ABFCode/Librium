import { describe, expect, it } from "vitest";
import { type SectionText, scanSections } from "../lib/searchScan";

const section = (...texts: string[]): SectionText => ({
	texts,
	lower: texts.map((t) => t.toLowerCase()),
});

describe("scanSections", () => {
	it("matches case-insensitively against the pre-lowered cache", () => {
		const out = scanSections(
			[section("The White Rabbit ran.")],
			"white rabbit",
			10,
		);
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({ sectionIndex: 0, blockIndex: 0 });
		expect(out[0].snippet).toContain("White Rabbit");
	});

	it("reports section and block indices", () => {
		const out = scanSections(
			[section("nothing here"), section("miss", "target text", "miss")],
			"target",
			10,
		);
		expect(out).toEqual([
			expect.objectContaining({ sectionIndex: 1, blockIndex: 1 }),
		]);
	});

	it("caps the number of results", () => {
		const many = Array.from({ length: 30 }, () => section("needle needle"));
		expect(scanSections(many, "needle", 7)).toHaveLength(7);
	});

	it("windows the snippet around the match", () => {
		const long = `${"a".repeat(200)} needle ${"b".repeat(200)}`;
		const [match] = scanSections([section(long)], "needle", 1);
		expect(match.snippet).toContain("needle");
		expect(match.snippet.length).toBeLessThanOrEqual(40 + "needle".length + 40);
	});

	it("respects the section range for windowed scanning", () => {
		const sections = [section("needle"), section("needle"), section("needle")];
		expect(scanSections(sections, "needle", 10, 1, 2)).toEqual([
			expect.objectContaining({ sectionIndex: 1 }),
		]);
	});

	it("returns nothing for an empty query", () => {
		expect(scanSections([section("text")], "", 10)).toEqual([]);
	});
});
