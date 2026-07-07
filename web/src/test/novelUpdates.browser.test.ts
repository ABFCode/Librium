import { describe, expect, it } from "vitest";
import { isNovelUpdatesUrl, parseNovelUpdatesHtml } from "../lib/novelUpdates";

const SOURCE = "https://www.novelupdates.com/series/martial-world/";

// Synthetic page mirroring the NU series-page structure the parser targets.
const FIXTURE = `<!doctype html>
<html>
<head>
	<meta property="og:title" content="Martial World - Novel Updates" />
	<meta property="og:image" content="http://cdn.novelupdates.com/images/mw.jpg" />
	<meta property="og:description" content="Truncated blurb…" />
</head>
<body>
	<div id="editdescription">
		<p>In the Realm of the Gods, a mysterious cube changes everything.</p>
		<p>A tale of cultivation.</p>
	</div>
	<div id="showauthors"><a href="#">Cocooned Cow</a><a href="#">蚕茧里的牛</a></div>
	<div id="seriesgenre">
		<a href="#">Action</a><a href="#">Adventure</a><a href="#">Xianxia</a>
	</div>
</body>
</html>`;

describe("parseNovelUpdatesHtml", () => {
	it("extracts the full candidate from a well-formed page", () => {
		const candidate = parseNovelUpdatesHtml(FIXTURE, SOURCE);
		expect(candidate.title).toBe("Martial World");
		expect(candidate.author).toBe("Cocooned Cow, 蚕茧里的牛");
		expect(candidate.description).toContain("mysterious cube");
		expect(candidate.description).toContain("tale of cultivation");
		expect(candidate.subjects).toEqual(["Action", "Adventure", "Xianxia"]);
		// http upgraded so the app (https) can render it.
		expect(candidate.coverUrl).toBe(
			"https://cdn.novelupdates.com/images/mw.jpg",
		);
		expect(candidate.source).toBe("novelupdates");
		expect(candidate.sourceUrl).toBe(SOURCE);
	});

	it("degrades per field when nodes are missing, never throws", () => {
		// Only og:title survives — description block, authors, genres gone.
		const mutilated = `<html><head>
			<meta property="og:title" content="Martial World - Novel Updates" />
		</head><body><div class="unrelated">nothing here</div></body></html>`;
		const candidate = parseNovelUpdatesHtml(mutilated, SOURCE);
		expect(candidate.title).toBe("Martial World");
		expect(candidate.author).toBeUndefined();
		expect(candidate.description).toBeUndefined();
		expect(candidate.subjects).toBeUndefined();
		expect(candidate.coverUrl).toBeUndefined();
	});

	it("falls back to og:description when the description block is absent", () => {
		const withoutBlock = FIXTURE.replace(
			/<div id="editdescription">[\s\S]*?<\/div>/,
			"",
		);
		const candidate = parseNovelUpdatesHtml(withoutBlock, SOURCE);
		expect(candidate.description).toBe("Truncated blurb…");
	});

	it("returns an empty candidate for junk input", () => {
		const candidate = parseNovelUpdatesHtml("not html at all", SOURCE);
		expect(candidate.title).toBeUndefined();
		expect(candidate.source).toBe("novelupdates");
	});
});

describe("isNovelUpdatesUrl", () => {
	it("accepts series pages on both hosts", () => {
		expect(isNovelUpdatesUrl(SOURCE)).toBe(true);
		expect(
			isNovelUpdatesUrl("https://novelupdates.com/series/reverend-insanity/"),
		).toBe(true);
	});

	it("rejects other hosts, paths, and junk", () => {
		expect(isNovelUpdatesUrl("https://evil.com/series/martial-world/")).toBe(
			false,
		);
		expect(isNovelUpdatesUrl("https://www.novelupdates.com/group/x/")).toBe(
			false,
		);
		expect(isNovelUpdatesUrl("not a url")).toBe(false);
	});
});
