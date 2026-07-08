// PWA affordances: persistent storage and the install prompt.

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

// Chromium fires `beforeinstallprompt` when the app is installable; the event
// must be captured and re-fired from a user gesture. iOS has no equivalent —
// installation is Share → Add to Home Screen, surfaced as a hint instead.
type InstallPromptEvent = Event & {
	prompt: () => Promise<void>;
};

let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
	window.addEventListener("beforeinstallprompt", (event) => {
		event.preventDefault();
		deferredPrompt = event as InstallPromptEvent;
		for (const listener of listeners) {
			listener();
		}
	});
	window.addEventListener("appinstalled", () => {
		deferredPrompt = null;
		for (const listener of listeners) {
			listener();
		}
	});
}

export function subscribeInstallPrompt(onChange: () => void) {
	listeners.add(onChange);
	return () => {
		listeners.delete(onChange);
	};
}

export function canPromptInstall() {
	return deferredPrompt !== null;
}

export async function promptInstall() {
	const prompt = deferredPrompt;
	deferredPrompt = null;
	for (const listener of listeners) {
		listener();
	}
	await prompt?.prompt();
}

// iOS Safari, not already installed: the only install path is manual.
export function isIosInstallCandidate() {
	if (typeof navigator === "undefined") {
		return false;
	}
	const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
	const standalone =
		window.matchMedia("(display-mode: standalone)").matches ||
		(navigator as { standalone?: boolean }).standalone === true;
	return isIos && !standalone;
}
