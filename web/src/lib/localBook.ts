import { contentTypeFromHref } from "@abfcode/spine";
import type { parseEpubToPayload } from "./epub";

type EpubPayload = ReturnType<typeof parseEpubToPayload>;

// Map a parsed EPUB payload to the saveImportedBook input. Shared by the
// import flow and device seeding (download from R2 → re-parse → IndexedDB).
export function payloadToLocalBookInput(bookId: string, payload: EpubPayload) {
	const m = payload.metadata;
	const blocksBySection = new Map(
		payload.sectionBlocks.map((sb) => [sb.sectionOrderIndex, sb.blocks]),
	);
	const coverType = payload.cover?.contentType || "image/jpeg";
	return {
		bookId,
		title: m.title,
		author:
			m.authors && m.authors.length > 0 ? m.authors.join(", ") : undefined,
		cover: payload.cover
			? {
					blob: new Blob([payload.cover.bytes as BlobPart], {
						type: coverType,
					}),
					contentType: coverType,
				}
			: undefined,
		sections: payload.sections.map((s) => ({
			orderIndex: s.orderIndex,
			title: s.title,
			depth: s.depth,
			href: s.href,
			anchor: s.anchor,
			blocks: blocksBySection.get(s.orderIndex) ?? [],
		})),
		images: payload.images.map((img) => {
			const ct =
				img.contentType ||
				contentTypeFromHref(img.href) ||
				"application/octet-stream";
			return {
				href: img.href,
				blob: new Blob([img.bytes as BlobPart], { type: ct }),
				contentType: ct,
			};
		}),
	};
}
