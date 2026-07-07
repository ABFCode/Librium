import { describe, expect, it } from "vitest";
import { groupBySeries } from "../lib/series";

const book = (
	title: string,
	series?: string,
	seriesIndex?: string,
): { _id: string; title: string; series?: string; seriesIndex?: string } => ({
	_id: title,
	title,
	series,
	seriesIndex,
});

describe("groupBySeries", () => {
	it("orders volumes numerically, not lexically", () => {
		const groups = groupBySeries([
			book("Vol 10", "Martial World", "10"),
			book("Vol 2", "Martial World", "2"),
			book("Vol 1", "Martial World", "1"),
		]);
		expect(groups).toHaveLength(1);
		expect(groups[0].books.map((b) => b.title)).toEqual([
			"Vol 1",
			"Vol 2",
			"Vol 10",
		]);
	});

	it("handles fractional indexes as strings", () => {
		const groups = groupBySeries([
			book("Two", "S", "2"),
			book("Interlude", "S", "1.5"),
			book("One", "S", "1"),
		]);
		expect(groups[0].books.map((b) => b.title)).toEqual([
			"One",
			"Interlude",
			"Two",
		]);
	});

	it("sorts indexless books after indexed ones, by title", () => {
		const groups = groupBySeries([
			book("Zeta Side Story", "S"),
			book("Alpha Side Story", "S"),
			book("Main", "S", "1"),
		]);
		expect(groups[0].books.map((b) => b.title)).toEqual([
			"Main",
			"Alpha Side Story",
			"Zeta Side Story",
		]);
	});

	it("groups series A→Z and puts standalone books last, order preserved", () => {
		const groups = groupBySeries([
			book("Standalone B"),
			book("Vol 1", "Zebra Saga", "1"),
			book("Standalone A"),
			book("Vol 1", "Apple Saga", "1"),
		]);
		expect(groups.map((g) => g.series)).toEqual([
			"Apple Saga",
			"Zebra Saga",
			null,
		]);
		// Standalone order = incoming (active sort), not alphabetized.
		expect(groups[2].books.map((b) => b.title)).toEqual([
			"Standalone B",
			"Standalone A",
		]);
	});

	it("treats blank series strings as standalone", () => {
		const groups = groupBySeries([book("X", "  "), book("Y", "")]);
		expect(groups).toHaveLength(1);
		expect(groups[0].series).toBeNull();
	});
});
