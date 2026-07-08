import { type EpubPayload, parseEpubToPayload } from "./epub";

type WorkerResult =
	| { ok: true; payload: EpubPayload }
	| { ok: false; error: string };

/**
 * Parse an EPUB off the main thread so multi-thousand-chapter imports don't
 * freeze the UI. Environment problems (no module-worker support, worker
 * chunk failed to load) fall back to the synchronous main-thread parse —
 * the worker is an optimization, never a point of failure. A parse error
 * *inside* the worker rejects: the same bytes would fail on any thread.
 */
export function parseEpubOffThread(bytes: Uint8Array): Promise<EpubPayload> {
	let worker: Worker;
	try {
		worker = new Worker(new URL("./parseEpub.worker.ts", import.meta.url), {
			type: "module",
		});
	} catch (err) {
		return mainThreadFallback(bytes, err);
	}
	return new Promise((resolve, reject) => {
		worker.onmessage = (event: MessageEvent<WorkerResult>) => {
			worker.terminate();
			if (event.data.ok) {
				resolve(event.data.payload);
			} else {
				reject(new Error(event.data.error));
			}
		};
		worker.onerror = (event) => {
			worker.terminate();
			mainThreadFallback(bytes, event).then(resolve, reject);
		};
		worker.postMessage(bytes);
	});
}

// The warn marker is asserted against in e2e: a real browser + real Vite must
// never take this path, so its appearance in the console fails the import
// journey. (vitest's browser mode can't run Vite module workers — its module
// interception breaks inside the worker — so unit tests exercise exactly
// this fallback, which is its own coverage.)
async function mainThreadFallback(
	bytes: Uint8Array,
	cause: unknown,
): Promise<EpubPayload> {
	console.warn("[librium] parse worker unavailable, parsing on main thread", {
		cause,
	});
	return parseEpubToPayload(bytes);
}
