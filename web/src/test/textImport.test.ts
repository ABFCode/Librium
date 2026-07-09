import { describe, expect, it } from "vitest";
import { isTextImport } from "../lib/convertTextOffThread";
import { parseEpubToPayload } from "../lib/epub";
import { convertTextToEpub } from "../lib/textToEpubCore";

// Round-trip: a .txt/.md webnovel rip converted by spine's text ingestion
// must come back through Librium's own parse pipeline as a coherent book —
// chapters cut, titles resolved, prose intact.

const encode = (s: string) => new TextEncoder().encode(s);

describe("convertTextToEpub", () => {
	it("cuts chapters from a plain-text webnovel rip", () => {
		const rip = [
			"Chapter 1",
			"",
			"The sect elder frowned at the recruit.",
			"",
			"Chapter 2",
			"",
			"Cultivation proceeded, slowly at first.",
			"",
			"Chapter 3",
			"",
			"A breakthrough, at last.",
		].join("\n");
		const payload = parseEpubToPayload(
			convertTextToEpub(encode(rip), "Ascending the Nine Heavens.txt"),
		);
		// Title falls back to the part name (extension stripped).
		expect(payload.metadata.title).toBe("Ascending the Nine Heavens");
		expect(payload.sections.length).toBe(3);
		expect(payload.sections.map((s) => s.title)).toEqual([
			"Chapter 1",
			"Chapter 2",
			"Chapter 3",
		]);
		const text = payload.chunks.map((c) => c.content).join("");
		expect(text).toContain("sect elder");
		expect(text).toContain("breakthrough");
	});

	it("takes the book title from an authored markdown H1", () => {
		const md = [
			"# The Real Title",
			"",
			"## First Steps",
			"",
			"Some prose.",
			"",
			"## Second Wind",
			"",
			"More prose.",
		].join("\n");
		const payload = parseEpubToPayload(
			convertTextToEpub(encode(md), "downloaded-file-3919.md"),
		);
		expect(payload.metadata.title).toBe("The Real Title");
		expect(payload.sections.map((s) => s.title)).toEqual([
			"First Steps",
			"Second Wind",
		]);
	});

	it("recognizes text imports by extension only", () => {
		expect(isTextImport("book.txt")).toBe(true);
		expect(isTextImport("book.MD")).toBe(true);
		expect(isTextImport("book.markdown")).toBe(true);
		expect(isTextImport("book.epub")).toBe(false);
		expect(isTextImport("txt")).toBe(false);
	});
});
