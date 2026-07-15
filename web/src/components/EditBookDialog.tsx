import { useAction, useConvex, useConvexAuth, useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { MetadataCandidate } from "../../convex/metadataProviders";
import { db } from "../lib/db";
import { safeExternalHref } from "../lib/externalUrl";
import type { DiffField } from "../lib/metadataDiff";
import {
	dataUrlToBlob,
	isNovelUpdatesUrl,
	parseLibriumPayload,
	parseNovelUpdatesHtml,
} from "../lib/novelUpdates";
import { quotaErrorMessage } from "../lib/quotaErrors";
import { uploadBookAsset } from "../lib/uploadBookAsset";
import { Icon } from "./Icon";
import { MetadataFetchPanel } from "./MetadataFetchPanel";
import { Modal } from "./Modal";

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

// Pending replacement cover: a picked/pasted file, or a fetched candidate's
// image URL (downloaded at save time — browser fetch first for CORS-friendly
// hosts, then the server proxy).
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
	const fetchCoverImage = useAction(api.metadata.fetchCoverImage);

	const [form, setForm] = useState<FormState>(() => toForm(book));
	// The values as they were when the dialog opened. The patch diffs against
	// THIS, not the live `book` prop — otherwise a concurrent edit from another
	// device (which refreshes `book` via the live query) would surface an
	// untouched field as a "change" and Save would revert it.
	const originalRef = useRef<FormState>(toForm(book));
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
	const [pastedHtml, setPastedHtml] = useState("");
	const [nuNotice, setNuNotice] = useState<string | null>(null);
	const sourceIsNovelUpdates = isNovelUpdatesUrl(form.sourceUrl.trim());
	const sourceHref = safeExternalHref(form.sourceUrl);
	const sourceUrlInvalid = form.sourceUrl.trim() !== "" && sourceHref === null;

	// Stable (setters only) so the window-level paste listener can call it.
	const adoptNuHtml = useCallback((html: string, sourceUrl: string) => {
		const candidate = parseNovelUpdatesHtml(html, sourceUrl);
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
	}, []);

	const fetchFromLinkedPage = async () => {
		setIsNuFetching(true);
		setNuNotice(null);
		try {
			const result = await fetchPageHtml({ url: form.sourceUrl.trim() });
			if (result.ok && result.html) {
				adoptNuHtml(result.html, form.sourceUrl.trim());
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

	// Revoke file-based preview URLs when they change or on unmount (url-kind
	// previews are plain remote URLs, nothing to revoke).
	useEffect(() => {
		return () => {
			if (pendingCover?.kind === "file") {
				URL.revokeObjectURL(pendingCover.previewUrl);
			}
		};
	}, [pendingCover]);

	// Single construction site for file-kind covers — picked, pasted, or from
	// the extension payload. (The revoke effect above cleans up previewUrls.)
	// Stable (setter only) so the window-level paste listener can call it.
	const setCoverFromBlob = useCallback((blob: Blob) => {
		setPendingCover({
			kind: "file",
			blob,
			previewUrl: URL.createObjectURL(blob),
		});
	}, []);

	// Pasting (Ctrl+V) anywhere in the dialog handles two special clipboards —
	// both exist because Cloudflare blocks every server-side fetch of
	// NovelUpdates, so data must arrive via the user's browser:
	//  - an image becomes the pending cover (right-click → Copy image on NU);
	//  - the companion extension's JSON payload (page HTML + cover data URL)
	//    fills the whole candidate and cover in one paste.
	// Plain text pastes match neither branch, so form fields are unaffected.
	useEffect(() => {
		const handlePaste = (event: ClipboardEvent) => {
			for (const item of event.clipboardData?.items ?? []) {
				if (!item.type.startsWith("image/")) {
					continue;
				}
				// An image item can still yield no File (synthetic pastes, some
				// clipboard managers) — keep scanning and let the text branch run.
				const file = item.getAsFile();
				if (file) {
					event.preventDefault();
					setError(null);
					setCoverFromBlob(file);
					return;
				}
			}
			const text = event.clipboardData?.getData("text/plain") ?? "";
			const payload = parseLibriumPayload(text);
			if (!payload) {
				// A Librium-prefixed text that fails to parse is a truncated
				// payload — swallow it instead of dumping ~200KB of JSON into
				// whatever field has focus.
				if (text.startsWith('{"librium"')) {
					event.preventDefault();
					setNuNotice(
						"That looked like a clipper payload but couldn't be read — copy the page again.",
					);
				}
				return;
			}
			event.preventDefault();
			setError(null);
			// Adopt the page's URL as the source link unless one is already set.
			setForm((prev) =>
				prev.sourceUrl.trim()
					? prev
					: { ...prev, sourceUrl: payload.sourceUrl },
			);
			adoptNuHtml(payload.html, payload.sourceUrl);
			if (payload.coverDataUrl) {
				const blob = dataUrlToBlob(payload.coverDataUrl);
				if (blob) {
					setCoverFromBlob(blob);
				} else {
					// After adoptNuHtml so this notice isn't cleared by its success.
					setNuNotice(
						"The copied cover couldn't be decoded — right-click the cover on the page, Copy image, and paste it here instead.",
					);
				}
			}
		};
		window.addEventListener("paste", handlePaste);
		return () => window.removeEventListener("paste", handlePaste);
	}, [adoptNuHtml, setCoverFromBlob]);

	const set = (field: keyof FormState) => (value: string) =>
		setForm((prev) => ({ ...prev, [field]: value }));

	// Changed fields only (vs the open-time snapshot); empty string = clear (null).
	const patch = useMemo(() => {
		const base = originalRef.current;
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
	}, [form]);

	const hasChanges =
		Object.keys(patch).length > 0 ||
		pendingCover !== null ||
		pendingSubjects !== null;
	const titleInvalid = form.title.trim() === "";
	const canSave =
		isAuthenticated &&
		hasChanges &&
		!titleInvalid &&
		!sourceUrlInvalid &&
		!isSaving;

	const pickCover = (file: File | undefined) => {
		if (!file) {
			return;
		}
		if (!file.type.startsWith("image/")) {
			setError("Cover must be an image file.");
			return;
		}
		setError(null);
		setCoverFromBlob(file);
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
			// Never downgrade a staged file cover to a url one: file covers
			// (picked/pasted/extension-captured) always upload, while url covers
			// can fail at Save — NU's CDN blocks every non-page fetch, and the
			// diff's cover row is checked by default, so without this guard
			// applying an NU candidate would clobber the working cover with one
			// that is guaranteed to 403.
			setPendingCover((prev) =>
				prev?.kind === "file"
					? prev
					: { kind: "url", url: coverUrl, previewUrl: coverUrl },
			);
		}
	};

	// Browser-side fetch first: the user's browser gets past Cloudflare where
	// the server can't, and CORS-friendly hosts (Open Library, Google Books)
	// let it read the bytes directly. The server proxy stays as the fallback
	// for hosts without CORS headers — and enforces this same cap server-side
	// (COVER_MAX_BYTES in convex/metadata.ts), so an oversized direct download
	// falls through to the proxy and fails there rather than uploading uncapped.
	const COVER_MAX_BYTES = 4 * 1024 * 1024;
	const fetchCoverBlob = async (url: string): Promise<Blob> => {
		try {
			const res = await fetch(url);
			if (res.ok) {
				const blob = await res.blob();
				if (blob.type.startsWith("image/") && blob.size <= COVER_MAX_BYTES) {
					return blob;
				}
			}
		} catch {
			// CORS or network — fall through to the proxy.
		}
		const { bytes, contentType } = await fetchCoverImage({ url });
		return new Blob([bytes], { type: contentType });
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
				// Cover failure is non-fatal — the details above are already
				// committed, so surface a way forward instead of a bare error.
				let blob: Blob;
				try {
					blob =
						pendingCover.kind === "file"
							? pendingCover.blob
							: await fetchCoverBlob(pendingCover.url);
				} catch {
					setPendingCover(null);
					setError(
						"Details saved, but the cover couldn't be downloaded (the image host blocks server-side fetches). Copy the image in your browser and paste it here (Ctrl+V), or use Replace…",
					);
					return;
				}
				const { coverStamp } = await uploadBookAsset(
					convex,
					book._id,
					"cover",
					blob,
				);
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
			setError(
				quotaErrorMessage(err) ??
					(err instanceof Error ? err.message : "Failed to save changes"),
			);
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
		<Modal
			label="Edit details"
			onClose={onClose}
			backdropClassName="px-6 py-8"
			panelClassName="surface flex max-h-full w-full max-w-lg flex-col p-6"
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
						<p className="mt-1 text-center text-[10px] text-[var(--muted-2)]">
							or paste an image
						</p>
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
				{sourceHref ? (
					<div className="flex flex-wrap items-center gap-3">
						<a
							className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] hover:underline"
							href={sourceHref}
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
				{sourceUrlInvalid ? (
					<p className="text-xs text-[var(--danger)]">
						Source page must be a valid https:// URL.
					</p>
				) : null}
				{nuNotice ? (
					<p className="text-xs text-[var(--muted)]">{nuNotice}</p>
				) : null}
				{showPasteFallback ? (
					<div className="flex flex-col gap-2">
						<textarea
							className="input min-h-20 py-2 font-mono text-xs"
							placeholder="Paste the NovelUpdates page HTML here…"
							value={pastedHtml}
							onChange={(event) => setPastedHtml(event.target.value)}
						/>
						<button
							type="button"
							className="btn btn-ghost self-start text-xs"
							disabled={pastedHtml.trim().length === 0}
							onClick={() => adoptNuHtml(pastedHtml, form.sourceUrl.trim())}
						>
							Parse pasted page
						</button>
					</div>
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
		</Modal>
	);
};
