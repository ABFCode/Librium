import { describe, expect, it } from "vitest";
import {
	dataUrlToBlob,
	isNovelUpdatesUrl,
	parseLibriumPayload,
	parseNovelUpdatesHtml,
} from "../lib/novelUpdates";
// Real NovelUpdates series page, captured live via the clipper extension on
// 2026-07-07 (Cloudflare blocks every server-side fetch, so this is the only
// way to obtain genuine markup). Guards the community selectors
// (#editdescription, #showauthors, #seriesgenre) against wishful thinking.
import realNuPage from "./fixtures/nu-memorize.html?raw";

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

	it("extracts every field from a real captured NU series page", () => {
		const nuSource = "https://www.novelupdates.com/series/m-e-m-o-r-i-z-e/";
		const candidate = parseNovelUpdatesHtml(realNuPage, nuSource);
		// og:title carries no " - Novel Updates" suffix on the live page (only
		// <title> does); the strip regex must be a harmless no-op.
		expect(candidate.title).toBe("M E M O R I Z E");
		// NU lists romanized + original-script author entries.
		expect(candidate.author).toBe("Ro Yu-jin, 로유진");
		expect(candidate.description).toContain("A man who had lost everything.");
		expect(candidate.description).toContain("Zero Code");
		expect(candidate.subjects).toEqual([
			"Action",
			"Adventure",
			"Fantasy",
			"Harem",
			"Mature",
			"Seinen",
		]);
		expect(candidate.coverUrl).toBe(
			"https://cdn.novelupdates.com/images/2019/06/memorize.jpeg",
		);
		expect(candidate.sourceUrl).toBe(nuSource);
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

describe("parseLibriumPayload", () => {
	const valid = {
		librium: 1,
		sourceUrl: SOURCE,
		html: FIXTURE,
		coverDataUrl: "data:image/png;base64,iVBORw0KGgo=",
	};

	it("accepts the extension's payload shape", () => {
		const payload = parseLibriumPayload(JSON.stringify(valid));
		expect(payload).not.toBeNull();
		expect(payload?.sourceUrl).toBe(SOURCE);
		expect(payload?.html).toBe(FIXTURE);
		expect(payload?.coverDataUrl).toBe(valid.coverDataUrl);
	});

	it("drops a non-image cover data URL but keeps the payload", () => {
		const payload = parseLibriumPayload(
			JSON.stringify({ ...valid, coverDataUrl: "data:text/html;base64,PGI+" }),
		);
		expect(payload).not.toBeNull();
		expect(payload?.coverDataUrl).toBeUndefined();
	});

	it("rejects wrong versions, non-NU sources, and plain text", () => {
		expect(
			parseLibriumPayload(JSON.stringify({ ...valid, librium: 2 })),
		).toBeNull();
		expect(
			parseLibriumPayload(
				JSON.stringify({ ...valid, sourceUrl: "https://evil.com/series/x/" }),
			),
		).toBeNull();
		expect(parseLibriumPayload("just some pasted text")).toBeNull();
		expect(parseLibriumPayload("{not json")).toBeNull();
	});
});

describe("dataUrlToBlob", () => {
	it("decodes a base64 image data URL", () => {
		const blob = dataUrlToBlob("data:image/png;base64,iVBORw0KGgo=");
		expect(blob).not.toBeNull();
		expect(blob?.type).toBe("image/png");
		expect(blob?.size).toBe(8);
	});

	it("tolerates media type parameters, dropping them from the Blob type", () => {
		const blob = dataUrlToBlob(
			"data:image/jpeg;charset=UTF-8;base64,iVBORw0KGgo=",
		);
		expect(blob).not.toBeNull();
		expect(blob?.type).toBe("image/jpeg");
	});

	it("returns null for non-image or malformed input", () => {
		expect(dataUrlToBlob("data:text/plain;base64,aGk=")).toBeNull();
		expect(dataUrlToBlob("data:image/png;base64,%%%")).toBeNull();
		expect(dataUrlToBlob("https://example.com/x.png")).toBeNull();
	});
});
