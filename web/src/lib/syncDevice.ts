export type SyncDeviceKind = "phone" | "tablet" | "computer" | "unknown";

const DEVICE_ID_KEY = "librium:syncDeviceId";

const createDeviceId = () => {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const detectDeviceKind = (): SyncDeviceKind => {
	if (typeof window === "undefined" || typeof navigator === "undefined") {
		return "unknown";
	}
	const touch =
		navigator.maxTouchPoints > 0 ||
		window.matchMedia?.("(pointer: coarse)").matches === true;
	if (!touch) {
		return "computer";
	}
	const shortViewport = Math.min(window.innerWidth, window.innerHeight);
	return shortViewport <= 600 ? "phone" : "tablet";
};

/**
 * A random installation id plus a coarse device class. This is intentionally
 * not a hardware fingerprint and contains no user-entered or browser-identifying
 * text; it exists only to make recovery history understandable across devices.
 */
export const getSyncDeviceInfo = () => {
	let id = "unknown-installation";
	if (typeof window !== "undefined") {
		try {
			id = window.localStorage.getItem(DEVICE_ID_KEY) ?? createDeviceId();
			window.localStorage.setItem(DEVICE_ID_KEY, id);
		} catch {
			id = createDeviceId();
		}
	}
	return { id, kind: detectDeviceKind() };
};

export const syncDeviceLabel = (kind: SyncDeviceKind | undefined) => {
	switch (kind) {
		case "phone":
			return "Phone";
		case "tablet":
			return "Tablet";
		case "computer":
			return "Computer";
		default:
			return "Device";
	}
};
