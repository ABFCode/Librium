// Convert a .txt/.md file to EPUB bytes off the main thread, with the same
// worker-first / lazy in-page fallback shape as parseEpubOffThread. Unlike
// the export rewrite, a conversion FAILURE fails the import for that file —
// there's no raw-copy fallback that makes sense for unparseable text input.

// Cheap predicate, deliberately NOT in textToEpubCore: the flow imports it
// statically, and putting it next to the spine-heavy converter would drag
// the whole text engine into the main import chunk.
export function isTextImport(fileName: string): boolean {
	return /\.(txt|md|markdown)$/i.test(fileName);
}

type WorkerResult =
	| { ok: true; bytes: Uint8Array }
	| { ok: false; error: string };

function convertInPage(
	bytes: Uint8Array,
	fileName: string,
): Promise<Uint8Array> {
	return import("./textToEpubCore").then(({ convertTextToEpub }) =>
		convertTextToEpub(bytes, fileName),
	);
}

export function convertTextOffThread(
	bytes: Uint8Array,
	fileName: string,
): Promise<Uint8Array> {
	let worker: Worker;
	try {
		worker = new Worker(new URL("./convertText.worker.ts", import.meta.url), {
			type: "module",
		});
	} catch {
		return convertInPage(bytes, fileName);
	}
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
			// Worker chunk unavailable — convert in-page instead.
			convertInPage(bytes, fileName).then(resolve, reject);
		};
		// Cloned, not transferred: the onerror path falls back to an in-page
		// conversion of these same bytes — a transferred buffer would arrive
		// there detached.
		worker.postMessage({ bytes, fileName });
	});
}
