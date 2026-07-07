import type { ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";

// Direct-to-R2 upload under a structured key (books/{bookId}/…): signed PUT
// URL → browser upload → sync the R2 component's metadata index. Shared by
// the import flow (EPUB + cover) and the edit dialog (cover replacement).
export async function uploadBookAsset(
	convex: ConvexReactClient,
	bookId: string,
	kind: "epub" | "cover",
	blob: Blob,
): Promise<string> {
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
	await convex.mutation(api.r2.syncMetadata, { key });
	return key;
}
