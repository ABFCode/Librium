// Ask the browser to protect IndexedDB from storage-pressure eviction.
// Safari in particular evicts site data after ~7 days without interaction
// unless persistence is granted — for a local-first reader that reads as
// "my whole library silently vanished and re-downloaded". Idempotent and
// silent: browsers grant/deny based on engagement, no prompt on most.
let persistRequested = false;
export function ensurePersistentStorage() {
	if (persistRequested || typeof navigator === "undefined") {
		return;
	}
	persistRequested = true;
	void (async () => {
		try {
			if (
				!navigator.storage?.persist ||
				(await navigator.storage.persisted())
			) {
				return;
			}
			await navigator.storage.persist();
		} catch {
			// Unsupported or denied — eviction stays possible, nothing to surface.
		}
	})();
}
