// Librium's EPUB → ingest-payload assembler. Port of the Go parser service's
// build* functions (main.go), now running on @/spine (the TS Spine port).
// Produces the same JSON contract the Go service produced.

import type { Block, Book, Inline, TOCItem } from "@abfcode/spine";
import { parse, posixClean, posixDir, posixJoin } from "@abfcode/spine";

const CHUNKING = { mode: "size" as const, maxChars: 2000 };

export interface SectionPayload {
	title: string;
	orderIndex: number;
	depth: number;
	parentOrderIndex?: number;
	href?: string;
	anchor?: string;
}

export interface ChunkPayload {
	sectionOrderIndex: number;
	chunkIndex: number;
	startOffset: number;
	endOffset: number;
	wordCount: number;
	content: string;
}

export interface SectionBlocksPayload {
	sectionOrderIndex: number;
	blocks: Block[];
}

export interface ImagePayload {
	href: string;
	contentType?: string;
	bytes: Uint8Array;
	width?: number;
	height?: number;
}

export interface EpubPayload {
	metadata: {
		title: string;
		authors: string[];
		language?: string;
		publisher?: string;
		publishedAt?: string;
		series?: string;
		seriesIndex?: string;
		subjects: string[];
		identifiers: { id: string; scheme: string; value: string; type: string }[];
	};
	sections: SectionPayload[];
	chunks: ChunkPayload[];
	sectionBlocks: SectionBlocksPayload[];
	images: ImagePayload[];
	cover?: { contentType: string; bytes: Uint8Array };
}

interface SectionInfo {
	title: string;
	orderIndex: number;
	anchorHref: string;
	depth: number;
	parentOrderIndex?: number;
	href: string;
	anchor: string;
}

function splitHrefAnchor(href: string): [string, string] {
	const i = href.indexOf("#");
	return i === -1 ? [href, ""] : [href.slice(0, i), href.slice(i + 1)];
}

function normalizeHrefPath(href: string): string {
	let clean = href.trim();
	if (!clean) return "";
	clean = clean.split("#")[0].split("?")[0];
	clean = clean.replace(/^\.\//, "").replace(/^\//, "");
	clean = posixClean(clean);
	return clean === "." ? "" : clean;
}

function resolveResourceHref(baseHref: string, src: string): string {
	const clean0 = src.trim();
	const lower = clean0.toLowerCase();
	if (
		lower.startsWith("http://") ||
		lower.startsWith("https://") ||
		lower.startsWith("data:") ||
		lower.startsWith("//")
	) {
		return "";
	}
	let clean = clean0.split("#")[0].split("?")[0];
	clean = clean.replace(/^\.\//, "").replace(/^\//, "");
	if (baseHref) clean = posixJoin(posixDir(baseHref), clean);
	clean = posixClean(clean);
	return clean === "." ? "" : clean;
}

function flattenTOC(
	items: TOCItem[],
	out: SectionInfo[],
	depth: number,
	parent?: number,
): void {
	for (const item of items) {
		let href = item.href;
		if (!href && item.target) href = item.target.href;
		const [hrefOnly, anchor] = splitHrefAnchor(href);
		out.push({
			title: item.label,
			orderIndex: out.length,
			anchorHref: href,
			depth,
			parentOrderIndex: parent,
			href: hrefOnly,
			anchor,
		});
		if (item.children.length > 0) {
			const currentIndex = out.length - 1;
			flattenTOC(item.children, out, depth + 1, currentIndex);
		}
	}
}

function buildSections(book: Book): SectionInfo[] {
	const sections: SectionInfo[] = [];
	if (book.toc.length > 0) flattenTOC(book.toc, sections, 0, undefined);
	if (sections.length === 0) {
		book.spine.forEach((item, i) => {
			sections.push({
				title: item.href || `Section ${i + 1}`,
				orderIndex: i,
				anchorHref: item.href,
				depth: 0,
				href: item.href,
				anchor: "",
			});
		});
	}
	sections.forEach((s, i) => {
		s.orderIndex = i;
		if (!s.title) s.title = `Section ${i + 1}`;
		if (s.anchorHref) {
			const [href, anchor] = splitHrefAnchor(s.anchorHref);
			s.href = normalizeHrefPath(href);
			s.anchor = anchor.trim();
		} else {
			s.href = normalizeHrefPath(s.href);
		}
	});
	return sections;
}

function convertInlines(
	inlines: Inline[],
	baseHref: string,
	book: Book,
	images: Map<string, ImagePayload>,
): Inline[] {
	return inlines.map((inline) => {
		if (inline.kind !== "image") return inline;
		const resolved = resolveResourceHref(baseHref, inline.src ?? "");
		if (!resolved) return inline;
		ensureImage(book, resolved, images);
		const meta = images.get(resolved);
		return {
			...inline,
			src: resolved,
			width: meta?.width,
			height: meta?.height,
		};
	});
}

function convertBlock(
	block: Block,
	baseHref: string,
	book: Book,
	images: Map<string, ImagePayload>,
): Block {
	const out: Block = { ...block };
	if (block.inlines)
		out.inlines = convertInlines(block.inlines, baseHref, book, images);
	if (block.table) {
		out.table = {
			rows: block.table.rows.map((r) => ({
				cells: r.cells.map((c) => ({
					...c,
					inlines: convertInlines(c.inlines, baseHref, book, images),
				})),
			})),
		};
	}
	if (block.figure) {
		out.figure = {
			images: convertInlines(block.figure.images, baseHref, book, images),
			caption: convertInlines(block.figure.caption, baseHref, book, images),
		};
	}
	return out;
}

function ensureImage(
	book: Book,
	href: string,
	images: Map<string, ImagePayload>,
): void {
	if (!href || images.has(href)) return;
	const bytes = book.openResource(href);
	if (!bytes || bytes.length === 0) return;
	images.set(href, { href, bytes }); // contentType/width/height filled later (async)
}

function buildSectionBlocks(
	book: Book,
	sections: SectionInfo[],
): { sectionBlocks: SectionBlocksPayload[]; images: ImagePayload[] } {
	const images = new Map<string, ImagePayload>();
	if (sections.length === 0) return { sectionBlocks: [], images: [] };

	const spineIndexByHref = new Map<string, number>();
	book.spine.forEach((item, i) => {
		const n = normalizeHrefPath(item.href);
		if (n) spineIndexByHref.set(n, i);
	});

	interface Target {
		sectionIndex: number;
		spineIndex: number;
		blockIndex: number;
		baseHref: string;
	}
	const targets: Target[] = [];
	for (const section of sections) {
		if (section.anchorHref) {
			const ref = book.resolveAnchor(section.anchorHref);
			if (ref) {
				const baseHref =
					ref.spineIndex >= 0 && ref.spineIndex < book.spine.length
						? normalizeHrefPath(book.spine[ref.spineIndex].href)
						: "";
				targets.push({
					sectionIndex: section.orderIndex,
					spineIndex: ref.spineIndex,
					blockIndex: ref.blockIndex,
					baseHref,
				});
				continue;
			}
		}
		if (section.href) {
			const idx = spineIndexByHref.get(normalizeHrefPath(section.href));
			if (idx !== undefined) {
				targets.push({
					sectionIndex: section.orderIndex,
					spineIndex: idx,
					blockIndex: 0,
					baseHref: normalizeHrefPath(section.href),
				});
			}
		}
	}
	if (targets.length === 0) return { sectionBlocks: [], images: [] };

	const bySpine = new Map<number, Target[]>();
	for (const t of targets) {
		const list = bySpine.get(t.spineIndex) ?? [];
		list.push(t);
		bySpine.set(t.spineIndex, list);
	}

	const sectionBlocksMap = new Map<number, Block[]>();
	for (const [spineIndex, list] of bySpine) {
		const blocks = book.blocks(spineIndex);
		list.sort((a, b) =>
			a.blockIndex === b.blockIndex
				? a.sectionIndex - b.sectionIndex
				: a.blockIndex - b.blockIndex,
		);
		for (let i = 0; i < list.length; i++) {
			const target = list[i];
			let start = target.blockIndex < 0 ? 0 : target.blockIndex;
			if (start > blocks.length) start = blocks.length;
			let end = blocks.length;
			for (let j = i + 1; j < list.length; j++) {
				if (list[j].blockIndex > start) {
					end = list[j].blockIndex;
					break;
				}
			}
			if (end < start) end = start;
			const slice = blocks.slice(start, end);
			const payloadBlocks = slice.map((b) =>
				convertBlock(b, target.baseHref, book, images),
			);
			if (payloadBlocks.length > 0)
				sectionBlocksMap.set(target.sectionIndex, payloadBlocks);
		}
	}

	const sectionBlocks: SectionBlocksPayload[] = [];
	for (const section of sections) {
		const blocks = sectionBlocksMap.get(section.orderIndex);
		if (blocks)
			sectionBlocks.push({ sectionOrderIndex: section.orderIndex, blocks });
	}
	const imageList = [...images.values()].sort((a, b) =>
		a.href < b.href ? -1 : a.href > b.href ? 1 : 0,
	);
	return { sectionBlocks, images: imageList };
}

function countWords(text: string): number {
	let count = 0;
	let inWord = false;
	for (const ch of text) {
		if (ch === " " || ch === "\n" || ch === "\t" || ch === "\r") {
			inWord = false;
			continue;
		}
		if (!inWord) {
			count++;
			inWord = true;
		}
	}
	return count;
}

function buildChunkPayloads(
	book: Book,
	sections: SectionInfo[],
): ChunkPayload[] {
	const chunks = book.chunks(CHUNKING);
	const secs =
		sections.length > 0
			? sections
			: [{ orderIndex: 0, anchorHref: "" } as SectionInfo];
	const chunkIndexByID = new Map<string, number>();
	chunks.forEach((c, i) => {
		chunkIndexByID.set(c.id, i);
	});

	const anchors: { sectionIndex: number; chunkIndex: number }[] = [];
	for (const section of secs) {
		if (!section.anchorHref) continue;
		const ref = book.resolveAnchor(section.anchorHref);
		if (!ref) continue;
		const chunkIdx = chunkIndexByID.get(ref.chunkId);
		if (chunkIdx === undefined) continue;
		anchors.push({ sectionIndex: section.orderIndex, chunkIndex: chunkIdx });
	}
	if (anchors.length === 0 && secs.length > 0)
		anchors.push({ sectionIndex: 0, chunkIndex: 0 });

	const resolveSectionIndex = (chunkIndex: number): number => {
		if (anchors.length === 0) return 0;
		let best = anchors[0].sectionIndex;
		let bestChunk = anchors[0].chunkIndex;
		for (const a of anchors) {
			if (a.chunkIndex <= chunkIndex && a.chunkIndex >= bestChunk) {
				best = a.sectionIndex;
				bestChunk = a.chunkIndex;
			}
		}
		return best;
	};

	const counters = new Map<number, number>();
	return chunks.map((chunk, i) => {
		const sectionIndex = resolveSectionIndex(i);
		const chunkIndex = counters.get(sectionIndex) ?? 0;
		counters.set(sectionIndex, chunkIndex + 1);
		return {
			sectionOrderIndex: sectionIndex,
			chunkIndex,
			startOffset: chunk.startOffset,
			endOffset: chunk.endOffset,
			wordCount: countWords(chunk.text),
			content: chunk.text,
		};
	});
}

/** Parse EPUB bytes into the Librium ingest payload. */
export function parseEpubToPayload(bytes: Uint8Array): EpubPayload {
	const book = parse(bytes);
	const sectionInfos = buildSections(book);
	const chunks = buildChunkPayloads(book, sectionInfos); // builds chunks + anchors first
	const { sectionBlocks, images } = buildSectionBlocks(book, sectionInfos);
	const cover = book.cover();
	const meta = book.metadata;
	return {
		metadata: {
			title: meta.title,
			authors: meta.authors,
			language: meta.language || undefined,
			publisher: meta.publisher || undefined,
			publishedAt: meta.pubDate || undefined,
			series: meta.series || undefined,
			seriesIndex: meta.seriesIndex || undefined,
			subjects: meta.subjects.map((s) => s.value).filter(Boolean),
			identifiers: meta.identifiers,
		},
		sections: sectionInfos.map((s) => ({
			title: s.title,
			orderIndex: s.orderIndex,
			depth: s.depth,
			parentOrderIndex: s.parentOrderIndex,
			href: s.href || undefined,
			anchor: s.anchor || undefined,
		})),
		chunks,
		sectionBlocks,
		images,
		cover: cover
			? { contentType: cover.contentType, bytes: cover.bytes }
			: undefined,
	};
}
