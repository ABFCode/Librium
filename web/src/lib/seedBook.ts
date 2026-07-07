import type { ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import { db, saveImportedBook } from "./db";
import { parseEpubToPayload } from "./epub";
import { payloadToLocalBookInput } from "./localBook";

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
	const payload = parseEpubToPayload(bytes);
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
		await db.books.update(bookId, {
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
		});
	}
}
