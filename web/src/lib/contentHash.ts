export async function sha256Hex(bytes: Uint8Array): Promise<string> {
	// digest honors the view's byteOffset/byteLength, so pass it directly — no
	// need to copy the (possibly multi-MB EPUB) backing buffer just to hash it.
	// (Cast: our byte views are always over a plain ArrayBuffer, never shared.)
	const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}
