import { describe, expect, it } from "vitest";
import { bookProgress } from "../lib/progress";

// Regression suite for the percent formula. History: (sectionIndex+1)/total
// showed a freshly imported 32-chapter book as 3% read; the completed-only
// fix pinned 1-chapter books at 0% forever and made 100% unreachable.
describe("bookProgress", () => {
	it("reads 0 for a freshly opened book", () => {
		expect(bookProgress(0, 0, 32)).toBe(0);
	});

	it("lets a single-chapter book progress", () => {
		expect(bookProgress(0, 0.5, 1)).toBe(0.5);
		expect(bookProgress(0, 0, 1)).toBe(0);
	});

	it("reaches exactly 1 when the last chapter is finished", () => {
		expect(bookProgress(31, 1, 32)).toBe(1);
		expect(bookProgress(0, 1, 1)).toBe(1);
	});

	it("counts completed chapters plus the current fraction", () => {
		expect(bookProgress(3, 0.5, 10)).toBeCloseTo(0.35);
	});

	it("never exceeds 1", () => {
		expect(bookProgress(40, 1, 32)).toBe(1);
	});

	it("clamps a malformed fraction into 0..1", () => {
		expect(bookProgress(3, 5, 10)).toBeCloseTo(0.4);
		expect(bookProgress(3, -2, 10)).toBeCloseTo(0.3);
	});

	it("returns 0 for an empty book", () => {
		expect(bookProgress(0, 0.5, 0)).toBe(0);
	});
});
