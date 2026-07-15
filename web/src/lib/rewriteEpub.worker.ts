import {
	type ExportCover,
	type ExportMetadata,
	rewriteEpubBytes,
} from "./rewriteEpubCore";

// Module worker: rebuild an EPUB with edited metadata off the main thread —
// a bulk export shouldn't jank the tab once per book.

type RewriteRequest = {
	bytes: Uint8Array;
	metadata: ExportMetadata;
	cover?: ExportCover;
};

type WorkerScope = {
	onmessage: ((event: MessageEvent<RewriteRequest>) => void) | null;
	postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

const scope = self as unknown as WorkerScope;

// Dedicated workers are reachable only through the Worker object held by the
// creating page. This is not cross-window postMessage and therefore has no
// untrusted origin to allowlist.
scope.onmessage = (event) => {
	try {
		const { bytes, metadata, cover } = event.data;
		const out = rewriteEpubBytes(bytes, metadata, cover);
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
