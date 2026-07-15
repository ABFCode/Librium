import { parseEpubToPayload } from "./epub";

// Module worker: parse an EPUB off the main thread (spine ≥0.4 has no DOM
// dependency, so the full pipeline runs here). The input arrives as a
// structured-clone copy — callers keep using their bytes (the import flow
// uploads the same buffer to R2 afterwards). The reply transfers its big
// binary buffers (images/cover) instead of copying them.

type WorkerScope = {
	onmessage: ((event: MessageEvent<Uint8Array>) => void) | null;
	postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

const scope = self as unknown as WorkerScope;

// This is a DedicatedWorkerGlobalScope, not a Window message listener. Only
// the page that owns this Worker object can reach it; cross-origin windows do
// not receive a reference and worker MessageEvents have no navigable origin.
scope.onmessage = (event) => {
	try {
		const payload = parseEpubToPayload(event.data);
		const transfers = new Set<ArrayBuffer>();
		for (const image of payload.images) {
			if (image.bytes.buffer instanceof ArrayBuffer) {
				transfers.add(image.bytes.buffer);
			}
		}
		if (payload.cover && payload.cover.bytes.buffer instanceof ArrayBuffer) {
			transfers.add(payload.cover.bytes.buffer);
		}
		scope.postMessage({ ok: true, payload }, [...transfers]);
	} catch (err) {
		scope.postMessage({
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		});
	}
};
