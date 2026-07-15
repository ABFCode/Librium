import { convertTextToEpub } from "./textToEpubCore";

// Module worker: text → EPUB conversion off the main thread (chapter
// detection over a multi-MB rip is real work). Input arrives as a
// structured-clone copy (the caller's in-page fallback still needs its
// bytes); the produced EPUB transfers back zero-copy.

type ConvertRequest = { bytes: Uint8Array; fileName: string };

type WorkerScope = {
	onmessage: ((event: MessageEvent<ConvertRequest>) => void) | null;
	postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

const scope = self as unknown as WorkerScope;

// Dedicated workers are reachable only through the Worker object held by the
// creating page. This is not cross-window postMessage and therefore has no
// untrusted origin to allowlist.
scope.onmessage = (event) => {
	try {
		const out = convertTextToEpub(event.data.bytes, event.data.fileName);
		scope.postMessage(
			{ ok: true, bytes: out },
			out.buffer instanceof ArrayBuffer ? [out.buffer] : [],
		);
	} catch (err) {
		scope.postMessage({
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		});
	}
};
