/**
 * Return a canonical external link only when it is safe to navigate to.
 * Source links are user-editable, so never pass their raw value to href.
 */
export const safeExternalHref = (raw: string | null | undefined) => {
	if (!raw?.trim()) {
		return null;
	}
	try {
		const url = new URL(raw.trim());
		if (url.protocol !== "https:" || url.username || url.password) {
			return null;
		}
		return url.href;
	} catch {
		return null;
	}
};
