import type { ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import { db, type LocalBook, saveImportedBook } from "./db";
import { payloadToLocalBookInput } from "./localBook";
import { parseEpubOffThread } from "./parseEpubOffThread";

// The identity fields a re-parse must NOT overwrite — user-edited metadata and
// a replaced cover, both server-authoritative and mirrored locally. Pure so
// the field list is unit-tested (the real regression risk is forgetting to add
// a newly-introduced identity field here). A replaced cover is preserved only
// when one exists locally, so a re-seed can still fill a missing cover.
export function bookIdentityPatch(existing: LocalBook): Partial<LocalBook> {
	return {
		title: existing.title,
		author: existing.author,
		series: existing.series,
		seriesIndex: existing.seriesIndex,
		description: existing.description,
		sourceUrl: existing.sourceUrl,
		...(existing.coverBlob
			? {
					coverBlob: existing.coverBlob,
					coverType: existing.coverType,
					coverVersion: existing.coverVersion,
				}
			: {}),
	};
}

// Seed a book's content onto this device: download the raw EPUB from R2 and
// re-parse it locally (ROADMAP Phase 5). Used by the reader (automatic, on
// open) and the library's explicit "Download to this device" action.
export async function seedBookFromR2(
	convex: ConvexReactClient,
	bookId: string,
	opts?: { replace?: boolean },
) {
	const url = (await convex.query(api.books.getEpubUrl, {
		bookId: bookId as never,
	})) as string | null;
	if (!url) {
		throw new Error("No backup copy is available for this book yet.");
	}
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error("EPUB download failed");
	}
	const bytes = new Uint8Array(await res.arrayBuffer());
	const payload = await parseEpubOffThread(bytes);
	if (opts?.replace) {
		// Replacing a stale parse wholesale — section counts may differ.
		await db.sections.where("bookId").equals(bookId).delete();
		await db.images.where("bookId").equals(bookId).delete();
	}
	// A re-parse refreshes *content*, never identity: the shelf row may carry
	// user-edited metadata and a replaced cover (server-authoritative, mirrored
	// locally) that the EPUB's embedded values must not resurrect.
	const existing = await db.books.get(bookId);
	await saveImportedBook(payloadToLocalBookInput(bookId, payload));
	if (existing) {
		await db.books.update(bookId, bookIdentityPatch(existing));
	}
}
