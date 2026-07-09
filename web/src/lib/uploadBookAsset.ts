import type { ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";

// Direct-to-R2 upload under a structured key (books/{bookId}/…): signed PUT
// URL → browser upload → server-side finalize, which verifies the object's
// real size against R2 (quota is enforced on verified bytes, not what the
// client claims) and attaches the key. Shared by the import flow (EPUB +
// cover) and the edit dialog (cover replacement).
export async function uploadBookAsset(
	convex: ConvexReactClient,
	bookId: string,
	kind: "epub" | "cover",
	blob: Blob,
): Promise<{ key: string; coverStamp: number | null }> {
	const { url, key } = await convex.mutation(api.books.generateBookUploadUrl, {
		bookId: bookId as never,
		kind,
	});
	const res = await fetch(url, {
		method: "PUT",
		headers: blob.type ? { "Content-Type": blob.type } : undefined,
		body: blob,
	});
	if (!res.ok) {
		throw new Error(`Upload failed (${kind})`);
	}
	const coverStamp = await convex.action(api.books.finalizeUpload, {
		bookId: bookId as never,
		kind,
	});
	return { key, coverStamp };
}
