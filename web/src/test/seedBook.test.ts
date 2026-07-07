import { describe, expect, it } from "vitest";
import type { LocalBook } from "../lib/db";
import { bookIdentityPatch } from "../lib/seedBook";

const base: LocalBook = {
	bookId: "b1",
	title: "Renamed",
	author: "Real Author",
	sectionCount: 10,
	parserVersion: "0.1.1",
	addedAt: 1,
	series: "Saga",
	seriesIndex: "2",
	description: "Edited blurb.",
	sourceUrl: "https://www.novelupdates.com/series/x/",
};

describe("bookIdentityPatch", () => {
	it("preserves every user-editable identity field", () => {
		// If a new editable field is added to the metadata dialog, it must be
		// added here too — this assertion is the guard against a re-parse
		// silently resurrecting the EPUB's embedded value.
		expect(bookIdentityPatch(base)).toEqual({
			title: "Renamed",
			author: "Real Author",
			series: "Saga",
			seriesIndex: "2",
			description: "Edited blurb.",
			sourceUrl: "https://www.novelupdates.com/series/x/",
		});
	});

	it("preserves a replaced cover when one exists locally", () => {
		const blob = new Blob(["img"], { type: "image/png" });
		const patch = bookIdentityPatch({
			...base,
			coverBlob: blob,
			coverType: "image/png",
			coverVersion: 42,
		});
		expect(patch.coverBlob).toBe(blob);
		expect(patch.coverType).toBe("image/png");
		expect(patch.coverVersion).toBe(42);
	});

	it("omits cover keys when there is no local cover, so a re-seed can fill it", () => {
		const patch = bookIdentityPatch(base);
		expect("coverBlob" in patch).toBe(false);
		expect("coverType" in patch).toBe(false);
		expect("coverVersion" in patch).toBe(false);
	});
});
