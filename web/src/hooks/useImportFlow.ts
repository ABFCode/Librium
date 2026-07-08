import { useConvex, useConvexAuth, useMutation } from "convex/react";
import { useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { db, saveImportedBook } from "../lib/db";
import { payloadToLocalBookInput } from "../lib/localBook";
import { parseEpubOffThread } from "../lib/parseEpubOffThread";
import { uploadBookAsset } from "../lib/uploadBookAsset";

export type QueueStatus = "queued" | "importing" | "done" | "failed";

export type QueueItem = {
	id: string;
	file: File;
	status: QueueStatus;
	title?: string;
	error?: string;
};

const fileKey = (f: File) => `${f.name}-${f.size}-${f.lastModified}`;

export const useImportFlow = () => {
	const convex = useConvex();
	const { isAuthenticated } = useConvexAuth();
	const registerImport = useMutation(api.books.registerImport);
	const attachFiles = useMutation(api.books.attachFiles);
	const [queue, setQueue] = useState<QueueItem[]>([]);
	const [isDragging, setIsDragging] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isUploading, setIsUploading] = useState(false);
	const runningRef = useRef(false);

	// Files still waiting to be imported (kept for compatibility with callers).
	const files = queue.filter((q) => q.status === "queued").map((q) => q.file);

	const setItem = (id: string, patch: Partial<QueueItem>) => {
		setQueue((prev) =>
			prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
		);
	};

	// Direct-to-R2 upload under a structured key (books/{bookId}/…).
	const uploadToR2 = (bookId: string, kind: "epub" | "cover", blob: Blob) =>
		uploadBookAsset(convex, bookId, kind, blob);

	const importOne = async (file: File) => {
		const bytes = new Uint8Array(await file.arrayBuffer());

		// Parse entirely in the browser, off the main thread — a 2,000-chapter
		// webnovel no longer freezes the import UI.
		const payload = await parseEpubOffThread(bytes);
		const m = payload.metadata;

		// Register metadata first — the book exists (and is readable locally,
		// below) before any blob upload starts.
		const bookId = (await registerImport({
			fileName: file.name,
			fileSize: file.size,
			sectionCount: payload.sections.length,
			metadata: {
				title: m.title,
				author:
					m.authors && m.authors.length > 0 ? m.authors.join(", ") : undefined,
				language: m.language,
				publisher: m.publisher,
				publishedAt: m.publishedAt,
				series: m.series,
				seriesIndex: m.seriesIndex,
				subjects: m.subjects,
				identifiers: m.identifiers,
			},
		})) as unknown as string;

		// Local-first: the parsed book lands in IndexedDB immediately.
		try {
			await saveImportedBook(payloadToLocalBookInput(bookId, payload));
		} catch {
			// IndexedDB unavailable — the R2 backup below still works.
		}

		// Backup the master copy (raw EPUB + cover) to R2, then attach the keys.
		const epubKey = await uploadToR2(
			bookId,
			"epub",
			new Blob([bytes as BlobPart], { type: "application/epub+zip" }),
		);
		let coverKey: string | undefined;
		if (payload.cover) {
			const coverType = payload.cover.contentType || "image/jpeg";
			coverKey = await uploadToR2(
				bookId,
				"cover",
				new Blob([payload.cover.bytes as BlobPart], { type: coverType }),
			);
		}
		const coverStamp = await attachFiles({
			bookId: bookId as never,
			epubKey,
			coverKey,
		});
		// Stamp the local cover with the server's coverUpdatedAt. Without this the
		// library reconcile sees coverVersion=undefined < remote.coverUpdatedAt,
		// drops the just-saved blob, and re-downloads the identical bytes from R2.
		if (coverKey && coverStamp) {
			await db.books
				.update(bookId, { coverVersion: coverStamp })
				.catch(() => {});
		}

		return m.title || file.name;
	};

	const submit = async () => {
		if (runningRef.current) {
			return;
		}
		const pending = queue.filter((q) => q.status === "queued");
		if (pending.length === 0) {
			setError("Select at least one EPUB file.");
			return;
		}
		if (!isAuthenticated) {
			setError("Please sign in to upload books.");
			return;
		}
		runningRef.current = true;
		setIsUploading(true);
		setError(null);
		// Sequential: one book at a time keeps memory bounded (parse runs in a
		// worker now, but each payload is large) and failures isolated per file.
		for (const item of pending) {
			setItem(item.id, { status: "importing" });
			try {
				const title = await importOne(item.file);
				setItem(item.id, { status: "done", title });
			} catch (err) {
				setItem(item.id, {
					status: "failed",
					error: err instanceof Error ? err.message : "Import failed",
				});
			}
		}
		setIsUploading(false);
		runningRef.current = false;
	};

	const addFiles = (incoming: FileList | File[]) => {
		const next = Array.from(incoming).filter((file) =>
			file.name.toLowerCase().endsWith(".epub"),
		);
		if (next.length === 0) {
			setError("Only EPUB files are supported.");
			return;
		}
		setError(null);
		setQueue((prev) => {
			const seen = new Set(prev.map((item) => fileKey(item.file)));
			const merged = [...prev];
			for (const file of next) {
				const key = fileKey(file);
				if (seen.has(key)) continue;
				seen.add(key);
				merged.push({
					id: `${key}-${merged.length}`,
					file,
					status: "queued",
				});
			}
			return merged;
		});
	};

	const clearFinished = () => {
		setQueue((prev) =>
			prev.filter(
				(item) => item.status === "queued" || item.status === "importing",
			),
		);
	};

	return {
		queue,
		files,
		isDragging,
		setIsDragging,
		error,
		setError,
		isUploading,
		isAuthenticated,
		submit,
		addFiles,
		clearFinished,
	};
};
