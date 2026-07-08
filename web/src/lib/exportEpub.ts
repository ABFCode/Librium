import { db } from "./db";
import type { ExportCover, ExportMetadata } from "./rewriteEpubCore";

// Export-with-write-back: exported EPUBs carry the user's edited metadata
// (title/author/series/description and a replaced cover) instead of whatever
// the source file shipped with. Best-effort by design — any failure at any
// stage falls back to the raw R2 copy, because an export must never fail on
// account of a nicety. The rewrite runs in a worker; environments that can't
// host module workers (vitest browser mode) fall back to an in-page rewrite,
// loaded lazily so the writer never weighs down the main bundle.

async function localIdentity(bookId: string): Promise<{
	metadata: ExportMetadata;
	cover?: ExportCover;
} | null> {
	const local = await db.books.get(bookId).catch(() => undefined);
	if (!local) {
		return null;
	}
	return {
		metadata: {
			title: local.title,
			author: local.author,
			series: local.series,
			seriesIndex: local.seriesIndex,
			description: local.description,
		},
		cover: local.coverBlob
			? {
					bytes: new Uint8Array(await local.coverBlob.arrayBuffer()),
					mediaType: local.coverType || "image/jpeg",
				}
			: undefined,
	};
}

type WorkerResult =
	| { ok: true; bytes: Uint8Array }
	| { ok: false; error: string };

function rewriteInWorker(
	bytes: Uint8Array,
	metadata: ExportMetadata,
	cover?: ExportCover,
): Promise<Uint8Array> {
	const worker = new Worker(
		new URL("./rewriteEpub.worker.ts", import.meta.url),
		{
			type: "module",
		},
	);
	return new Promise((resolve, reject) => {
		worker.onmessage = (event: MessageEvent<WorkerResult>) => {
			worker.terminate();
			if (event.data.ok) {
				resolve(event.data.bytes);
			} else {
				reject(new Error(event.data.error));
			}
		};
		worker.onerror = () => {
			worker.terminate();
			// Worker chunk unavailable — rewrite in-page instead (lazy import).
			void import("./rewriteEpubCore")
				.then(({ rewriteEpubBytes }) =>
					resolve(rewriteEpubBytes(bytes, metadata, cover)),
				)
				.catch(reject);
		};
		worker.postMessage({ bytes, metadata, cover });
	});
}

/** Rewrite EPUB bytes with the book's edited identity; on any failure return
 *  the original bytes untouched. */
export async function rewriteEpubForExport(
	bytes: Uint8Array,
	bookId: string,
): Promise<Uint8Array> {
	try {
		const identity = await localIdentity(bookId);
		if (!identity) {
			return bytes;
		}
		return await rewriteInWorker(bytes, identity.metadata, identity.cover);
	} catch {
		return bytes;
	}
}
