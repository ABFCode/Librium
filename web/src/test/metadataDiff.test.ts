import { describe, expect, it } from "vitest";
import { diffCandidate } from "../lib/metadataDiff";

const current = {
	title: "martial world",
	author: "",
	series: "",
	description: "Old blurb.",
	subjects: ["Action"],
};

describe("diffCandidate", () => {
	it("proposes only fields the candidate has and that differ", () => {
		const diffs = diffCandidate(current, {
			title: "Martial World",
			author: "Cocooned Cow",
			source: "openlibrary",
		});
		expect(diffs.map((d) => d.field)).toEqual(["title", "author"]);
		expect(diffs[0]).toMatchObject({
			current: "martial world",
			proposed: "Martial World",
		});
		// The candidate has no description — the existing one is never
		// proposed for change (absence is not a proposal to clear).
		expect(diffs.find((d) => d.field === "description")).toBeUndefined();
	});

	it("skips values identical after trimming", () => {
		const diffs = diffCandidate(current, {
			title: "  martial world  ",
			description: "Old blurb.",
			source: "googlebooks",
		});
		expect(diffs).toHaveLength(0);
	});

	it("joins subjects for display and keeps the raw array as the value", () => {
		const diffs = diffCandidate(current, {
			subjects: ["Action", "Xianxia", " "],
			source: "novelupdates",
		});
		expect(diffs).toHaveLength(1);
		expect(diffs[0].proposed).toBe("Action, Xianxia");
		expect(diffs[0].value).toEqual(["Action", "Xianxia"]);
	});

	it("treats identical subject lists as unchanged", () => {
		const diffs = diffCandidate(current, {
			subjects: ["Action"],
			source: "openlibrary",
		});
		expect(diffs).toHaveLength(0);
	});
});
