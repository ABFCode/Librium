import { useAction, useConvex, useConvexAuth, useMutation } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { MetadataCandidate } from "../../convex/metadataProviders";
import { db } from "../lib/db";
import type { DiffField } from "../lib/metadataDiff";
import { isNovelUpdatesUrl, parseNovelUpdatesHtml } from "../lib/novelUpdates";
import { uploadBookAsset } from "../lib/uploadBookAsset";
import { Icon } from "./Icon";
import { MetadataFetchPanel } from "./MetadataFetchPanel";

// The full server doc drives the form — editing is online-only (the books
// table is server-authoritative); accepted edits are mirrored into the local
// Dexie shelf row so offline views agree.
export type EditableBook = {
	_id: string;
	title: string;
	author?: string | null;
	series?: string | null;
	seriesIndex?: string | null;
	description?: string | null;
	language?: string | null;
	sourceUrl?: string | null;
};

type EditBookDialogProps = {
	book: EditableBook;
	coverUrl?: string;
	onClose: () => void;
};

type FormState = {
	title: string;
	author: string;
	series: string;
	seriesIndex: string;
	description: string;
	language: string;
	sourceUrl: string;
};

const toForm = (book: EditableBook): FormState => ({
	title: book.title,
	author: book.author ?? "",
	series: book.series ?? "",
	seriesIndex: book.seriesIndex ?? "",
	description: book.description ?? "",
	language: book.language ?? "",
	sourceUrl: book.sourceUrl ?? "",
});

// Pending replacement cover: a picked file, or a fetched candidate's image
// URL (downloaded via the server proxy at save time — image hosts rarely
// send CORS headers).
type PendingCover =
	| { kind: "file"; blob: Blob; previewUrl: string }
	| { kind: "url"; url: string; previewUrl: string };

export const EditBookDialog = ({
	book,
	coverUrl,
	onClose,
}: EditBookDialogProps) => {
	const convex = useConvex();
	const { isAuthenticated } = useConvexAuth();
	const updateBookMetadata = useMutation(api.metadata.updateBookMetadata);
	const attachFiles = useMutation(api.books.attachFiles);
	const fetchCoverImage = useAction(api.metadata.fetchCoverImage);

	const [form, setForm] = useState<FormState>(() => toForm(book));
	const [pendingCover, setPendingCover] = useState<PendingCover | null>(null);
	// Subjects have no form control — they arrive only via the fetch panel.
	const [pendingSubjects, setPendingSubjects] = useState<string[] | null>(null);
	const [isFetchOpen, setIsFetchOpen] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	// NovelUpdates page fetch: server-side attempt first; Cloudflare usually
	// 403s it, which reveals the paste-the-page fallback. Both paths produce a
	// candidate that flows through the same diff preview.
	const fetchPageHtml = useAction(api.metadata.fetchPageHtml);
	const [nuCandidate, setNuCandidate] = useState<MetadataCandidate | null>(
		null,
	);
	const [isNuFetching, setIsNuFetching] = useState(false);
	const [showPasteFallback, setShowPasteFallback] = useState(false);
	const [nuNotice, setNuNotice] = useState<string | null>(null);
	const sourceIsNovelUpdates = isNovelUpdatesUrl(form.sourceUrl.trim());

	const adoptNuHtml = (html: string) => {
		const candidate = parseNovelUpdatesHtml(html, form.sourceUrl.trim());
		if (!candidate.title && !candidate.description && !candidate.coverUrl) {
			setNuNotice(
				"Couldn't find metadata in that page — make sure it's the full series page HTML.",
			);
			return;
		}
		setNuCandidate(candidate);
		setNuNotice(null);
		setShowPasteFallback(false);
		setIsFetchOpen(true);
	};

	const fetchFromLinkedPage = async () => {
		setIsNuFetching(true);
		setNuNotice(null);
		try {
			const result = await fetchPageHtml({ url: form.sourceUrl.trim() });
			if (result.ok && result.html) {
				adoptNuHtml(result.html);
				return;
			}
			// The expected Cloudflare outcome — degrade to paste.
			setShowPasteFallback(true);
			setNuNotice(
				"NovelUpdates blocked the automated fetch (this is normal). Open the page, copy its HTML (Ctrl+U, then select all), and paste it below.",
			);
		} catch (err) {
			setNuNotice(err instanceof Error ? err.message : "Fetch failed");
		} finally {
			setIsNuFetching(false);
		}
	};

	useEffect(() => {
		const handleKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [onClose]);

	// Revoke file-based preview URLs when they change or on unmount (url-kind
	// previews are plain remote URLs, nothing to revoke).
	useEffect(() => {
		return () => {
			if (pendingCover?.kind === "file") {
				URL.revokeObjectURL(pendingCover.previewUrl);
			}
		};
	}, [pendingCover]);

	const set = (field: keyof FormState) => (value: string) =>
		setForm((prev) => ({ ...prev, [field]: value }));

	// Changed fields only; empty string = clear the field (null).
	const patch = useMemo(() => {
		const base = toForm(book);
		const out: Record<string, string | null> = {};
		for (const key of Object.keys(base) as (keyof FormState)[]) {
			const next = form[key].trim();
			if (next === base[key].trim()) {
				continue;
			}
			if (key === "title") {
				// Title never clears; an emptied title blocks Save below.
				out.title = next;
				continue;
			}
			out[key] = next === "" ? null : next;
		}
		return out;
	}, [book, form]);

	const hasChanges =
		Object.keys(patch).length > 0 ||
		pendingCover !== null ||
		pendingSubjects !== null;
	const titleInvalid = form.title.trim() === "";
	const canSave = isAuthenticated && hasChanges && !titleInvalid && !isSaving;

	const pickCover = (file: File | undefined) => {
		if (!file) {
			return;
		}
		if (!file.type.startsWith("image/")) {
			setError("Cover must be an image file.");
			return;
		}
		setError(null);
		setPendingCover({
			kind: "file",
			blob: file,
			previewUrl: URL.createObjectURL(file),
		});
	};

	// Fetched metadata lands in the form (and pending cover/subjects) — the
	// server is only touched by Save.
	const applyFetched = (
		fields: Partial<Record<DiffField, string | string[]>>,
		coverUrl?: string,
	) => {
		setForm((prev) => {
			const next = { ...prev };
			for (const key of ["title", "author", "series", "description"] as const) {
				const value = fields[key];
				if (typeof value === "string") {
					next[key] = value;
				}
			}
			return next;
		});
		if (Array.isArray(fields.subjects)) {
			setPendingSubjects(fields.subjects);
		}
		if (coverUrl) {
			setPendingCover({ kind: "url", url: coverUrl, previewUrl: coverUrl });
		}
	};

	const save = async () => {
		if (!canSave) {
			return;
		}
		setIsSaving(true);
		setError(null);
		try {
			if (Object.keys(patch).length > 0 || pendingSubjects !== null) {
				await updateBookMetadata({
					bookId: book._id as never,
					...patch,
					...(pendingSubjects !== null ? { subjects: pendingSubjects } : {}),
				});
				// Mirror into the local shelf row so offline views agree without
				// waiting for the next reconcile. (Subjects aren't mirrored — the
				// local row doesn't carry them.)
				const mirror: Record<string, string | undefined> = {};
				for (const [key, value] of Object.entries(patch)) {
					mirror[key] = value ?? undefined;
				}
				await db.books.update(book._id, mirror).catch(() => {});
			}
			if (pendingCover) {
				const blob =
					pendingCover.kind === "file"
						? pendingCover.blob
						: await (async () => {
								const { bytes, contentType } = await fetchCoverImage({
									url: pendingCover.url,
								});
								return new Blob([bytes], { type: contentType });
							})();
				const coverKey = await uploadBookAsset(convex, book._id, "cover", blob);
				const coverStamp = await attachFiles({
					bookId: book._id as never,
					coverKey,
				});
				await db.books
					.update(book._id, {
						coverBlob: blob,
						coverType: blob.type || undefined,
						coverVersion: coverStamp ?? undefined,
					})
					.catch(() => {});
			}
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save changes");
		} finally {
			setIsSaving(false);
		}
	};

	const field = (label: string, key: keyof FormState, placeholder?: string) => (
		<label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
			{label}
			<input
				className="input h-9 text-sm"
				value={form[key]}
				placeholder={placeholder}
				onChange={(event) => set(key)(event.target.value)}
			/>
		</label>
	);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close is a pointer nicety; Escape and the Cancel button cover keyboard users
		// biome-ignore lint/a11y/useKeyWithClickEvents: see above
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-6 py-8"
			onClick={onClose}
		>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: the click handler only stops backdrop-close propagation */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: see above */}
			<div
				className="surface flex max-h-full w-full max-w-lg flex-col p-6"
				onClick={(event) => event.stopPropagation()}
			>
				<h2 className="text-xl">Edit details</h2>
				<div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-1">
					<div className="flex gap-4">
						<div className="w-24 shrink-0">
							<div className="book-cover-frame has-cover overflow-hidden">
								{pendingCover ? (
									<img
										src={pendingCover.previewUrl}
										alt=""
										className="h-full w-full object-cover"
									/>
								) : coverUrl ? (
									<img
										src={coverUrl}
										alt=""
										className="h-full w-full object-cover"
									/>
								) : (
									<div className="flex h-full items-center justify-center p-2 text-center text-xs text-[var(--muted-2)]">
										No cover
									</div>
								)}
							</div>
							<input
								ref={fileInputRef}
								type="file"
								accept="image/*"
								className="hidden"
								onChange={(event) => pickCover(event.target.files?.[0])}
							/>
							<button
								type="button"
								className="btn btn-ghost mt-2 w-full text-xs"
								onClick={() => fileInputRef.current?.click()}
							>
								Replace…
							</button>
						</div>
						<div className="flex min-w-0 flex-1 flex-col gap-2">
							{field("Title", "title")}
							{field("Author", "author", "Unknown")}
							<div className="grid grid-cols-[1fr_72px] gap-2">
								{field("Series", "series", "None")}
								{field("#", "seriesIndex", "1")}
							</div>
						</div>
					</div>
					<label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
						Description
						<textarea
							className="input min-h-24 py-2 text-sm"
							value={form.description}
							onChange={(event) => set("description")(event.target.value)}
						/>
					</label>
					<div className="grid grid-cols-2 gap-2">
						{field("Language", "language", "en")}
						{field("Source page URL", "sourceUrl", "https://…")}
					</div>
					{form.sourceUrl.trim() ? (
						<div className="flex flex-wrap items-center gap-3">
							<a
								className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] hover:underline"
								href={form.sourceUrl.trim()}
								target="_blank"
								rel="noreferrer"
							>
								<Icon name="external-link" size={12} />
								Open source page
							</a>
							{sourceIsNovelUpdates ? (
								<button
									type="button"
									className="chip"
									disabled={isNuFetching}
									onClick={() => void fetchFromLinkedPage()}
								>
									{isNuFetching ? "Fetching…" : "Fetch from linked page"}
								</button>
							) : null}
						</div>
					) : null}
					{nuNotice ? (
						<p className="text-xs text-[var(--muted)]">{nuNotice}</p>
					) : null}
					{showPasteFallback ? (
						<textarea
							className="input min-h-20 py-2 font-mono text-xs"
							placeholder="Paste the NovelUpdates page HTML here…"
							onChange={(event) => {
								const html = event.target.value;
								if (html.trim().length > 0) {
									adoptNuHtml(html);
								}
							}}
						/>
					) : null}
					<div className="border-t border-[color-mix(in_srgb,var(--outline)_60%,transparent)] pt-3">
						<button
							type="button"
							className={`chip ${isFetchOpen ? "is-active" : ""}`}
							onClick={() => setIsFetchOpen((prev) => !prev)}
						>
							Fetch metadata
						</button>
						{isFetchOpen ? (
							<div className="mt-3">
								<MetadataFetchPanel
									bookId={book._id}
									current={{
										title: form.title,
										author: form.author,
										series: form.series,
										description: form.description,
										subjects: pendingSubjects ?? undefined,
									}}
									extraCandidate={nuCandidate}
									onApply={applyFetched}
								/>
							</div>
						) : null}
					</div>
				</div>
				{titleInvalid ? (
					<p className="mt-3 text-xs text-[var(--danger)]">
						Title cannot be empty.
					</p>
				) : null}
				{error ? (
					<p className="mt-3 text-xs text-[var(--danger)]">{error}</p>
				) : null}
				{!isAuthenticated ? (
					<p className="mt-3 text-xs text-[var(--muted-2)]">
						Editing needs a connection — metadata lives on the server.
					</p>
				) : null}
				<div className="mt-5 flex justify-end gap-2">
					<button
						type="button"
						className="btn btn-ghost text-xs"
						onClick={onClose}
					>
						Cancel
					</button>
					<button
						type="button"
						className="btn btn-primary text-xs"
						disabled={!canSave}
						onClick={() => void save()}
					>
						{isSaving ? "Saving…" : "Save"}
					</button>
				</div>
			</div>
		</div>
	);
};
