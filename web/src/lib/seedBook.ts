import type { ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
	db,
	type LibriumDatabase,
	type LocalBook,
	saveImportedBook,
} from "./db";
import { payloadToLocalBookInput } from "./localBook";
import { parseEpubOffThread } from "./parseEpubOffThread";
import { ensurePersistentStorage } from "./persistentStorage";

// The identity fields a re-parse must NOT overwrite — user-edited metadata and
// a replaced cover, both server-authoritative and mirrored locally. Pure so
// the field list is unit-tested (the real regression risk is forgetting to add
// a newly-introduced identity field here). Twin list: rewriteEpubCore.ts's
// ExportMetadata bakes these same fields into exported EPUBs — extend both.
// A replaced cover is preserved only when one exists locally, so a re-seed
// can still fill a missing cover.
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
// onProgress reports streamed download bytes (total from Content-Length,
// which is CORS-safelisted so R2 exposes it without extra headers).
export async function seedBookFromR2(
	convex: ConvexReactClient,
	bookId: string,
	opts?: {
		replace?: boolean;
		onProgress?: (loaded: number, total?: number) => void;
		database?: LibriumDatabase;
	},
) {
	const targetDb = opts?.database ?? db;
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
	let bytes: Uint8Array;
	if (opts?.onProgress && res.body) {
		const total = Number(res.headers.get("content-length") ?? 0) || undefined;
		const reader = res.body.getReader();
		const chunks: Uint8Array[] = [];
		let loaded = 0;
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			chunks.push(value);
			loaded += value.byteLength;
			opts.onProgress(loaded, total);
		}
		bytes = new Uint8Array(loaded);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
	} else {
		bytes = new Uint8Array(await res.arrayBuffer());
	}
	const payload = await parseEpubOffThread(bytes);
	if (opts?.replace) {
		// Replacing a stale parse wholesale — section counts may differ.
		await targetDb.sections.where("bookId").equals(bookId).delete();
		await targetDb.images.where("bookId").equals(bookId).delete();
	}
	// A re-parse refreshes *content*, never identity: the shelf row may carry
	// user-edited metadata and a replaced cover (server-authoritative, mirrored
	// locally) that the EPUB's embedded values must not resurrect.
	const existing = await targetDb.books.get(bookId);
	await saveImportedBook(payloadToLocalBookInput(bookId, payload), targetDb);
	if (existing) {
		await targetDb.books.update(bookId, bookIdentityPatch(existing));
	}
	// A book's content now lives on this device — the moment persistence is
	// worth asking for (Safari evicts IndexedDB after ~7 idle days otherwise).
	// Deferred to here (not login) so the browser's prompt is self-explanatory.
	ensurePersistentStorage();
}
