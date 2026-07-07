import { useAction, useConvex, useConvexAuth, useQuery } from "convex/react";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import { useCollectionSync } from "../hooks/useCollectionSync";
import { useStatusSync } from "../hooks/useStatusSync";
import {
	db,
	deleteLocalBook,
	type LocalBook,
	purgeOrphanedContent,
	removeLocalContent,
} from "../lib/db";
import { bookProgress } from "../lib/progress";
import { seedBookFromR2 } from "../lib/seedBook";
import { groupBySeries } from "../lib/series";
import {
	effectiveStatus,
	type ReadingStatus,
	STATUS_OPTIONS,
} from "../lib/status";
import { BookCard, type LibraryBook } from "./BookCard";
import { CollectionPickerDialog } from "./CollectionPickerDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { type EditableBook, EditBookDialog } from "./EditBookDialog";
import { type LibrarySort, LibraryToolbar } from "./LibraryToolbar";
import { ManageCollectionsDialog } from "./ManageCollectionsDialog";
import { RequireAuth } from "./RequireAuth";

// Grace period before purging a local book missing from the remote list —
// covers the moment between a fresh import's local write and the reactive
// remote list catching up.
const PURGE_GRACE_MS = 60_000;

export function Library() {
	const convex = useConvex();
	const { isAuthenticated } = useConvexAuth();
	const canQuery = isAuthenticated;
	const deleteBook = useAction(api.books.deleteBook);

	// Local-first: the shelf renders from IndexedDB when the server list is
	// unavailable (offline); the remote list is authoritative when present.
	const remoteBooks = useQuery(api.books.listByOwner, canQuery ? {} : "skip");
	const localBooks = useLiveQuery(() => db.books.toArray(), []);
	const localProgress = useLiveQuery(() => db.progress.toArray(), []);

	const books: LibraryBook[] | undefined = useMemo(() => {
		if (remoteBooks) {
			return remoteBooks as LibraryBook[];
		}
		if (localBooks === undefined) {
			return undefined;
		}
		if (localBooks.length > 0) {
			const progressTimes = new Map(
				(localProgress ?? []).map((p) => [p.bookId, p.editedAt]),
			);
			return localBooks.map((b) => ({
				_id: b.bookId,
				title: b.title,
				author: b.author,
				series: b.series,
				seriesIndex: b.seriesIndex,
				sectionCount: b.sectionCount,
				createdAt: b.addedAt,
				updatedAt: progressTimes.get(b.bookId) ?? b.addedAt,
			}));
		}
		// Empty local shelf: online, wait for the server; offline, show empty.
		return canQuery ? undefined : [];
	}, [remoteBooks, localBooks, localProgress, canQuery]);

	const progressEntries = useQuery(
		api.userBooks.listByUser,
		canQuery ? {} : "skip",
	);
	const recentEntries = useQuery(
		api.userBooks.listRecentByUser,
		canQuery ? { limit: books?.length ?? 200 } : "skip",
	);

	// Which books have their content cached on this device (parserVersion set
	// = full local parse; metadata-only shelf rows have it empty).
	const downloadedIds = useMemo(() => {
		const set = new Set<string>();
		for (const b of localBooks ?? []) {
			if (b.parserVersion) {
				set.add(b.bookId);
			}
		}
		return set;
	}, [localBooks]);

	// Local storage usage. The estimate is origin-wide, so prefer the
	// IndexedDB portion when the browser breaks it down (Chrome) — the
	// total also counts service-worker caches and anything else ever
	// stored on this origin.
	const [storageUsage, setStorageUsage] = useState<number | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the shelf changes, not on every render of the sampler closure
	useEffect(() => {
		let cancelled = false;
		if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
			return;
		}
		const sample = () => {
			void navigator.storage.estimate().then((est) => {
				const detailed = (est as { usageDetails?: { indexedDB?: number } })
					.usageDetails?.indexedDB;
				const usage = detailed ?? est.usage;
				if (!cancelled && typeof usage === "number") {
					setStorageUsage(usage);
				}
			});
		};
		// Sample twice: an immediate estimate reads pre-compaction numbers right
		// after bulk deletes; a delayed second pass catches the settled value.
		const first = window.setTimeout(sample, 500);
		const second = window.setTimeout(sample, 4000);
		return () => {
			cancelled = true;
			window.clearTimeout(first);
			window.clearTimeout(second);
		};
		// Re-measure only when the shelf actually changes — measuring on every
		// IndexedDB write makes the figure visibly jitter. (The deps are the
		// re-measure triggers, not captures — see biome-ignore above.)
	}, [downloadedIds.size, books?.length]);

	// Bulk operations (global; per-book actions live in each card's menu).
	const [bulkStatus, setBulkStatus] = useState<string | null>(null);
	const [isMarkMenuOpen, setIsMarkMenuOpen] = useState(false);

	// In-app confirmation dialog (replaces native window.confirm/prompt).
	type ConfirmRequest = {
		title: string;
		message: string;
		confirmLabel: string;
		danger?: boolean;
		requireText?: string;
		resolve: (ok: boolean) => void;
	};
	const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(
		null,
	);
	// Stable (useCallback) so the memoized BookCard's shallow prop compare
	// holds — otherwise every card re-renders on any Library state change.
	const askConfirm = useCallback(
		(opts: Omit<ConfirmRequest, "resolve">) =>
			new Promise<boolean>((resolve) =>
				setConfirmRequest((prev) => {
					// Never strand a pending caller: replacing an open dialog resolves
					// the displaced request as cancelled.
					prev?.resolve(false);
					return { ...opts, resolve };
				}),
			),
		[],
	);

	// Multi-select: covers toggle selection instead of opening the reader.
	const [isSelecting, setIsSelecting] = useState(false);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const exitSelection = useCallback(() => {
		setIsSelecting(false);
		setSelectedIds(new Set());
	}, []);
	const toggleSelected = useCallback((bookId: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(bookId)) {
				next.delete(bookId);
			} else {
				next.add(bookId);
			}
			return next;
		});
	}, []);
	useEffect(() => {
		if (!isSelecting) {
			return;
		}
		const handleKey = (event: KeyboardEvent) => {
			// Escape while a confirm dialog is open belongs to the dialog —
			// exiting selection too would wipe the user's picks.
			if (event.key === "Escape" && confirmRequest === null) {
				exitSelection();
			}
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [isSelecting, confirmRequest, exitSelection]);

	// One list-parameterized implementation per bulk operation — the
	// whole-library and selection paths are thin wrappers, so behavior and
	// copy can't drift between them.
	const downloadBooks = async (list: LibraryBook[]) => {
		const targets = list.filter((b) => !downloadedIds.has(b._id));
		if (targets.length === 0 || bulkStatus) {
			return;
		}
		setError(null);
		let done = 0;
		for (const book of targets) {
			setBulkStatus(`Downloading… ${done}/${targets.length}`);
			try {
				await seedBookFromR2(convex, book._id);
			} catch {
				// Skip failures (e.g. upload still pending); continue with the rest.
			}
			done += 1;
		}
		setBulkStatus(null);
	};

	const removeDownloadsFor = async (list: LibraryBook[], title: string) => {
		const targets = list.filter((b) => downloadedIds.has(b._id));
		if (targets.length === 0 || bulkStatus) {
			return;
		}
		const ok = await askConfirm({
			title,
			message: `Remove ${targets.length} downloaded book${targets.length === 1 ? "" : "s"} from this device? Your library, progress, and bookmarks are unaffected — books re-download when opened.`,
			confirmLabel: "Remove",
		});
		if (!ok) {
			return;
		}
		setError(null);
		setBulkStatus("Removing downloads…");
		for (const book of targets) {
			try {
				await removeLocalContent(book._id);
			} catch {
				// Continue; the reconcile pass can retry later.
			}
		}
		setBulkStatus(null);
	};

	const deleteBooks = async (list: LibraryBook[], title: string) => {
		if (list.length === 0 || bulkStatus) {
			return false;
		}
		const ok = await askConfirm({
			title,
			message: `This permanently deletes ${list.length} book${list.length === 1 ? "" : "s"} from your library and cloud backup, on every device.`,
			confirmLabel: "Delete",
			danger: true,
			requireText: "DELETE",
		});
		if (!ok) {
			return false;
		}
		setError(null);
		let done = 0;
		for (const book of list) {
			setBulkStatus(`Deleting… ${done}/${list.length}`);
			try {
				await deleteBook({ bookId: book._id as never });
				await deleteLocalBook(book._id).catch(() => {});
			} catch (err) {
				setError(
					err instanceof Error ? err.message : `Failed to delete ${book.title}`,
				);
			}
			done += 1;
		}
		setBulkStatus(null);
		return true;
	};

	const handleDownloadAll = () => downloadBooks(books ?? []);
	const handleRemoveAllDownloads = () =>
		removeDownloadsFor(books ?? [], "Clear downloads");
	const handleDeleteAllBooks = () =>
		deleteBooks(books ?? [], "Delete all books");

	// Durability escape hatch: pull raw EPUBs back out of R2 (egress is
	// free). Sequential to keep the browser's multi-download prompt tame.
	const exportBooks = async (list: LibraryBook[]) => {
		if (list.length === 0 || bulkStatus) {
			return;
		}
		setError(null);
		let done = 0;
		for (const book of list) {
			setBulkStatus(`Exporting… ${done}/${list.length}`);
			try {
				await handleDownload(book._id, book.title);
				// Give the browser breathing room between download triggers.
				await new Promise((resolve) => setTimeout(resolve, 600));
			} catch {
				// Skip failures (e.g. upload still pending); continue with the rest.
			}
			done += 1;
		}
		setBulkStatus(null);
	};

	const handleExportAll = () => exportBooks(books ?? []);

	// ── Selection bulk actions ─────────────────────────────────────────────────
	const selectedBooks = () =>
		(books ?? []).filter((book) => selectedIds.has(book._id));

	const handleSelectedDownload = () => downloadBooks(selectedBooks());
	const handleSelectedExport = () => exportBooks(selectedBooks());
	const handleSelectedRemoveDownloads = () =>
		removeDownloadsFor(selectedBooks(), "Remove downloads");
	const handleSelectedDelete = async () => {
		const deleted = await deleteBooks(selectedBooks(), "Delete selected books");
		if (deleted) {
			exitSelection();
		}
	};

	const [downloadingId, setDownloadingId] = useState<string | null>(null);
	const handleDeviceDownload = useCallback(
		async (bookId: string) => {
			try {
				setError(null);
				setDownloadingId(bookId);
				await seedBookFromR2(convex, bookId);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Download failed");
			} finally {
				setDownloadingId(null);
			}
		},
		[convex],
	);
	const handleRemoveDownload = useCallback(async (bookId: string) => {
		try {
			setError(null);
			await removeLocalContent(bookId);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to remove download",
			);
		}
	}, []);

	// Covers: object URLs from local blobs; ask the server only for the rest.
	const [localCoverUrls, setLocalCoverUrls] = useState<Record<string, string>>(
		{},
	);
	useEffect(() => {
		if (!localBooks) {
			return;
		}
		const created: string[] = [];
		const urls: Record<string, string> = {};
		for (const b of localBooks) {
			if (b.coverBlob) {
				const url = URL.createObjectURL(b.coverBlob);
				urls[b.bookId] = url;
				created.push(url);
			}
		}
		setLocalCoverUrls(urls);
		return () => {
			for (const url of created) {
				URL.revokeObjectURL(url);
			}
		};
	}, [localBooks]);

	const missingCoverIds = useMemo(
		() => (books ?? []).map((b) => b._id).filter((id) => !localCoverUrls[id]),
		[books, localCoverUrls],
	);
	const remoteCoverUrls = useQuery(
		api.books.getCoverUrls,
		canQuery && missingCoverIds.length > 0
			? { bookIds: missingCoverIds as never }
			: "skip",
	);
	const coverUrls = useMemo(
		() => ({ ...(remoteCoverUrls ?? {}), ...localCoverUrls }),
		[remoteCoverUrls, localCoverUrls],
	);

	// Reconcile local ↔ remote: purge local copies of books deleted elsewhere,
	// and cache-fill shelf rows for books imported on another device.
	useEffect(() => {
		if (!remoteBooks || localBooks === undefined) {
			return;
		}
		const remoteIds = new Set(remoteBooks.map((b) => b._id as string));
		void (async () => {
			for (const local of localBooks) {
				if (
					!remoteIds.has(local.bookId) &&
					Date.now() - local.addedAt > PURGE_GRACE_MS
				) {
					try {
						await deleteLocalBook(local.bookId);
					} catch {
						// Retried on the next reconcile.
					}
				}
			}
			const localById = new Map(localBooks.map((b) => [b.bookId, b]));
			for (const remote of remoteBooks) {
				const id = remote._id as string;
				const local = localById.get(id);
				try {
					if (!local) {
						await db.books.put({
							bookId: id,
							title: remote.title,
							author: remote.author ?? undefined,
							series: remote.series ?? undefined,
							seriesIndex: remote.seriesIndex ?? undefined,
							description: remote.description ?? undefined,
							sourceUrl: remote.sourceUrl ?? undefined,
							sectionCount: remote.sectionCount ?? 0,
							// Metadata-only row: blocks arrive via reader cache-fill; the
							// parser version applies only once blocks exist.
							parserVersion: "",
							addedAt: Date.now(),
						});
						continue;
					}
					// Server-authoritative metadata: mirror drifted fields into the
					// local row (edits land here from this device or any other).
					const patch: Partial<LocalBook> = {};
					if (local.title !== remote.title) {
						patch.title = remote.title;
					}
					if ((local.author ?? null) !== (remote.author ?? null)) {
						patch.author = remote.author ?? undefined;
					}
					if ((local.series ?? null) !== (remote.series ?? null)) {
						patch.series = remote.series ?? undefined;
					}
					if ((local.seriesIndex ?? null) !== (remote.seriesIndex ?? null)) {
						patch.seriesIndex = remote.seriesIndex ?? undefined;
					}
					if ((local.description ?? null) !== (remote.description ?? null)) {
						patch.description = remote.description ?? undefined;
					}
					if ((local.sourceUrl ?? null) !== (remote.sourceUrl ?? null)) {
						patch.sourceUrl = remote.sourceUrl ?? undefined;
					}
					// Cover replaced elsewhere: drop the stale blob; the cover
					// cache-fill below re-fetches and stamps the new version.
					if (
						local.coverBlob &&
						remote.coverUpdatedAt !== undefined &&
						(local.coverVersion ?? 0) < remote.coverUpdatedAt
					) {
						patch.coverBlob = undefined;
						patch.coverType = undefined;
						patch.coverVersion = undefined;
					}
					if (Object.keys(patch).length > 0) {
						await db.books.update(id, patch);
					}
				} catch {
					// IndexedDB unavailable — shelf still renders from the server.
				}
			}
		})();
	}, [remoteBooks, localBooks]);

	// Sweep content rows with no shelf row (interrupted deletes, legacy dev
	// data) so the storage figure reflects the actual library. Once per visit:
	// running it inside the reconcile effect would re-scan the indexes on
	// every books-table write (each seed/delete in a bulk operation).
	useEffect(() => {
		void purgeOrphanedContent().catch(() => {
			// Best-effort hygiene; retried on the next visit.
		});
	}, []);

	// Cache-fill remote covers into IndexedDB so the shelf has art offline.
	useEffect(() => {
		if (!remoteCoverUrls) {
			return;
		}
		// Stamp the fetched blob with the server's cover version so a later
		// replacement (coverUpdatedAt bump) is detectable as stale.
		const coverStampById = new Map(
			(remoteBooks ?? []).map((b) => [b._id as string, b.coverUpdatedAt]),
		);
		let cancelled = false;
		void (async () => {
			for (const [bookId, url] of Object.entries(remoteCoverUrls)) {
				if (cancelled || !url) {
					continue;
				}
				try {
					const row = await db.books.get(bookId);
					if (!row || row.coverBlob) {
						continue;
					}
					const res = await fetch(url);
					if (!res.ok) {
						continue;
					}
					const blob = await res.blob();
					await db.books.update(bookId, {
						coverBlob: blob,
						coverType: blob.type || undefined,
						coverVersion: coverStampById.get(bookId),
					});
				} catch {
					// Offline or transient — retried next visit.
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [remoteCoverUrls, remoteBooks]);
	const [query, setQuery] = useState("");
	const [sortBy, setSortBy] = useState<LibrarySort>("recent");
	const [error, setError] = useState<string | null>(null);
	const [openMenuId, setOpenMenuId] = useState<string | null>(null);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}
		const saved = window.localStorage.getItem("library:sort");
		if (
			saved === "recent" ||
			saved === "title" ||
			saved === "author" ||
			saved === "progress" ||
			saved === "series"
		) {
			setSortBy(saved);
		}
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}
		window.localStorage.setItem("library:sort", sortBy);
	}, [sortBy]);

	// Shelf filters: status tab, active collection, downloaded-only. Persisted
	// together (the sort chip has its own key for back-compat).
	const [shelfStatus, setShelfStatus] = useState<"all" | ReadingStatus>("all");
	const [collectionFilter, setCollectionFilter] = useState<string | null>(null);
	const [downloadedOnly, setDownloadedOnly] = useState(false);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}
		try {
			const raw = window.localStorage.getItem("library:filters");
			if (!raw) {
				return;
			}
			const saved = JSON.parse(raw) as {
				status?: string;
				collectionKey?: string | null;
				downloadedOnly?: boolean;
			};
			if (
				saved.status === "all" ||
				STATUS_OPTIONS.some((option) => option.key === saved.status)
			) {
				setShelfStatus(saved.status as "all" | ReadingStatus);
			}
			if (typeof saved.collectionKey === "string") {
				setCollectionFilter(saved.collectionKey);
			}
			if (typeof saved.downloadedOnly === "boolean") {
				setDownloadedOnly(saved.downloadedOnly);
			}
		} catch {
			// Malformed saved state — defaults win.
		}
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}
		window.localStorage.setItem(
			"library:filters",
			JSON.stringify({
				status: shelfStatus,
				collectionKey: collectionFilter,
				downloadedOnly,
			}),
		);
	}, [shelfStatus, collectionFilter, downloadedOnly]);

	// Local-first explicit reading status (LWW sync).
	const { statusByBookId, setStatus } = useStatusSync({ canQuery });

	// Local-first collections (tombstone sync).
	const {
		collections,
		membershipsByBook,
		createCollection,
		renameCollection,
		deleteCollection,
		addBooks,
		removeBooks,
	} = useCollectionSync({ canQuery });
	// Books being organized in the picker (one from a card menu, many from
	// bulk select); null = closed.
	const [pickerBookIds, setPickerBookIds] = useState<string[] | null>(null);
	const [isManageOpen, setIsManageOpen] = useState(false);
	const openPickerForBook = useCallback((bookId: string) => {
		setPickerBookIds([bookId]);
	}, []);

	// Edit details: online-only, driven by the full server doc.
	const [editingBookId, setEditingBookId] = useState<string | null>(null);
	const editingBook = useMemo(
		() =>
			editingBookId
				? ((remoteBooks?.find((b) => (b._id as string) === editingBookId) ??
						null) as EditableBook | null)
				: null,
		[editingBookId, remoteBooks],
	);
	const openEditDetails = useCallback((bookId: string) => {
		setEditingBookId(bookId);
	}, []);

	const countByCollection = useMemo(() => {
		const map = new Map<string, number>();
		for (const keys of membershipsByBook.values()) {
			for (const key of keys) {
				map.set(key, (map.get(key) ?? 0) + 1);
			}
		}
		return map;
	}, [membershipsByBook]);

	// A filter pointing at a collection that no longer exists (deleted here or
	// elsewhere) silently resets — an empty ghost shelf would look like a bug.
	useEffect(() => {
		if (
			collectionFilter !== null &&
			collections !== undefined &&
			!collections.some((c) => c.clientKey === collectionFilter)
		) {
			setCollectionFilter(null);
		}
	}, [collectionFilter, collections]);

	const progressByBookId = useMemo(() => {
		const map = new Map<string, { progress: number; updatedAt?: number }>();
		if (progressEntries) {
			for (const entry of progressEntries) {
				map.set(entry.bookId, {
					progress: entry.progress,
					updatedAt: entry.updatedAt,
				});
			}
			return map;
		}
		// Offline: derive progress from the local records.
		if (localProgress) {
			const counts = new Map(
				(localBooks ?? []).map((b) => [b.bookId, b.sectionCount]),
			);
			for (const p of localProgress) {
				const total = counts.get(p.bookId) ?? 0;
				map.set(p.bookId, {
					// Completed chapters + fraction of the current one — mirrors
					// userBooks.listByUser.
					progress: bookProgress(p.sectionIndex, p.sectionFraction ?? 0, total),
					updatedAt: p.editedAt,
				});
			}
		}
		return map;
	}, [progressEntries, localProgress, localBooks]);

	const recentOrder = useMemo(() => {
		if (!recentEntries) {
			return new Map<string, number>();
		}
		const map = new Map<string, number>();
		recentEntries.forEach((entry, index) => {
			map.set(entry.book._id, index);
		});
		return map;
	}, [recentEntries]);

	const filteredBooks = useMemo(() => {
		if (!books) {
			return [];
		}
		let next = books;
		if (query.trim()) {
			const lower = query.toLowerCase();
			next = next.filter(
				(book) =>
					book.title.toLowerCase().includes(lower) ||
					(book.author ?? "").toLowerCase().includes(lower),
			);
		}
		if (shelfStatus !== "all") {
			next = next.filter(
				(book) =>
					effectiveStatus(
						statusByBookId.get(book._id) ?? null,
						progressByBookId.get(book._id)?.progress ?? 0,
					) === shelfStatus,
			);
		}
		if (collectionFilter !== null) {
			next = next.filter((book) =>
				membershipsByBook.get(book._id)?.has(collectionFilter),
			);
		}
		if (downloadedOnly) {
			next = next.filter((book) => downloadedIds.has(book._id));
		}
		return next;
	}, [
		books,
		query,
		shelfStatus,
		statusByBookId,
		progressByBookId,
		collectionFilter,
		membershipsByBook,
		downloadedOnly,
		downloadedIds,
	]);

	const sortedBooks = useMemo(() => {
		const next = [...filteredBooks];
		if (sortBy === "recent") {
			next.sort((a, b) => {
				const aRank = recentOrder.get(a._id);
				const bRank = recentOrder.get(b._id);
				if (aRank !== undefined && bRank !== undefined) {
					return aRank - bRank;
				}
				if (aRank !== undefined) {
					return -1;
				}
				if (bRank !== undefined) {
					return 1;
				}
				return (
					(b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0)
				);
			});
		} else if (sortBy === "title" || sortBy === "series") {
			// Series mode groups after sorting; title order is the stable base for
			// the standalone tail.
			next.sort((a, b) => a.title.localeCompare(b.title));
		} else if (sortBy === "author") {
			next.sort((a, b) => (a.author ?? "").localeCompare(b.author ?? ""));
		} else if (sortBy === "progress") {
			next.sort((a, b) => {
				const aProgress = progressByBookId.get(a._id)?.progress ?? 0;
				const bProgress = progressByBookId.get(b._id)?.progress ?? 0;
				return bProgress - aProgress;
			});
		}
		return next;
	}, [filteredBooks, progressByBookId, recentOrder, sortBy]);

	const handleDelete = useCallback(
		async (bookId: string) => {
			const confirmDelete = await askConfirm({
				title: "Delete book",
				message:
					"Delete this book and its stored files? This removes it from your library and cloud backup, on every device.",
				confirmLabel: "Delete",
				danger: true,
			});
			if (!confirmDelete) {
				return;
			}
			try {
				setError(null);
				await deleteBook({ bookId: bookId as never });
				// Delete parity: purge this device's local copy too.
				await deleteLocalBook(bookId).catch(() => {});
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to delete book");
			}
		},
		[askConfirm, deleteBook],
	);

	const handleDownload = useCallback(
		async (bookId: string, title: string) => {
			try {
				setError(null);
				const url = (await convex.query(api.books.getEpubUrl, {
					bookId: bookId as never,
				})) as string | null;
				if (!url) {
					setError("Unable to generate download link.");
					return;
				}
				// Fetch to a blob: the download attribute is ignored on cross-origin
				// URLs, so a direct link would save every book as the R2 key's
				// basename ("book.epub"). A blob URL is same-origin and names cleanly.
				const res = await fetch(url);
				if (!res.ok) {
					throw new Error("Download failed");
				}
				const blob = await res.blob();
				const objectUrl = URL.createObjectURL(blob);
				const safeTitle =
					title
						.replace(/[\\/:*?"<>|]/g, "_")
						.trim()
						.slice(0, 120) || "book";
				const link = document.createElement("a");
				link.href = objectUrl;
				link.download = `${safeTitle}.epub`;
				document.body.appendChild(link);
				link.click();
				link.remove();
				window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Download failed");
			}
		},
		[convex],
	);

	const renderCard = (book: LibraryBook) => {
		const progress = progressByBookId.get(book._id);
		return (
			<BookCard
				key={book._id}
				book={book}
				coverUrl={coverUrls?.[book._id]}
				progressPercent={progress ? Math.round(progress.progress * 100) : null}
				isDownloaded={downloadedIds.has(book._id)}
				isDownloading={downloadingId === book._id}
				isSelecting={isSelecting}
				isSelected={selectedIds.has(book._id)}
				isMenuOpen={openMenuId === book._id}
				explicitStatus={statusByBookId.get(book._id) ?? null}
				onSetStatus={setStatus}
				onAddToCollection={openPickerForBook}
				onEditDetails={openEditDetails}
				onToggleSelect={toggleSelected}
				onMenuOpenChange={setOpenMenuId}
				onDeviceDownload={handleDeviceDownload}
				onRemoveDownload={handleRemoveDownload}
				onSaveEpub={handleDownload}
				onDelete={handleDelete}
			/>
		);
	};

	return (
		<RequireAuth>
			{confirmRequest ? (
				<ConfirmDialog
					title={confirmRequest.title}
					message={confirmRequest.message}
					confirmLabel={confirmRequest.confirmLabel}
					danger={confirmRequest.danger}
					requireText={confirmRequest.requireText}
					onConfirm={() => {
						confirmRequest.resolve(true);
						setConfirmRequest(null);
					}}
					onCancel={() => {
						confirmRequest.resolve(false);
						setConfirmRequest(null);
					}}
				/>
			) : null}
			{pickerBookIds !== null ? (
				<CollectionPickerDialog
					bookIds={pickerBookIds}
					collections={collections ?? []}
					membershipsByBook={membershipsByBook}
					onAdd={(key, ids) => void addBooks(key, ids)}
					onRemove={(key, ids) => void removeBooks(key, ids)}
					onCreate={createCollection}
					onClose={() => setPickerBookIds(null)}
				/>
			) : null}
			{editingBook ? (
				<EditBookDialog
					book={editingBook}
					coverUrl={coverUrls?.[editingBook._id]}
					onClose={() => setEditingBookId(null)}
				/>
			) : null}
			{isManageOpen ? (
				<ManageCollectionsDialog
					collections={collections ?? []}
					countByCollection={countByCollection}
					onRename={(key, name) => void renameCollection(key, name)}
					onDelete={(key, name) => {
						// Close Manage before confirming: both use `fixed inset-0 z-50`,
						// so a confirm rendered underneath would be unclickable and share
						// the Escape key. One modal open at a time.
						setIsManageOpen(false);
						void (async () => {
							const confirmed = await askConfirm({
								title: "Delete collection",
								message: `Delete "${name}"? The books themselves are untouched.`,
								confirmLabel: "Delete",
								danger: true,
							});
							if (confirmed) {
								await deleteCollection(key);
							}
						})();
					}}
					onClose={() => setIsManageOpen(false)}
				/>
			) : null}
			<div className="min-h-screen px-6 pb-16 pt-8">
				<div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
					<LibraryToolbar
						bookCount={books ? books.length : null}
						downloadedCount={downloadedIds.size}
						storageUsage={storageUsage}
						query={query}
						onQueryChange={setQuery}
						sortBy={sortBy}
						onSortByChange={setSortBy}
						isSelecting={isSelecting}
						onToggleSelecting={() =>
							isSelecting ? exitSelection() : setIsSelecting(true)
						}
						bulkStatus={bulkStatus}
						onDownloadAll={() => void handleDownloadAll()}
						onRemoveAllDownloads={() => void handleRemoveAllDownloads()}
						onExportAll={() => void handleExportAll()}
						onDeleteAllBooks={() => void handleDeleteAllBooks()}
						shelfStatus={shelfStatus}
						onShelfStatusChange={setShelfStatus}
						downloadedOnly={downloadedOnly}
						onToggleDownloadedOnly={() => setDownloadedOnly((prev) => !prev)}
						collectionFilter={collectionFilter}
						onCollectionFilterChange={setCollectionFilter}
						collections={collections ?? []}
						countByCollection={countByCollection}
						onManageCollections={() => setIsManageOpen(true)}
					/>
					{isSelecting ? (
						<div className="surface-soft flex flex-wrap items-center gap-2 px-3 py-2">
							<span className="text-sm text-[var(--muted)]">
								{selectedIds.size} selected
							</span>
							<button
								type="button"
								className="chip"
								// Only the currently visible (filtered) books — selecting
								// invisible books would let a bulk action silently hit rows
								// the user can't see or deselect.
								onClick={() =>
									setSelectedIds(new Set(filteredBooks.map((b) => b._id)))
								}
							>
								Select all
							</button>
							<div className="ml-auto flex flex-wrap items-center gap-2">
								{/* biome-ignore lint/a11y/noStaticElementInteractions: hover-out dismiss is a pointer nicety; the menu itself is keyboard-operable via its buttons */}
								<div
									className="relative"
									onMouseLeave={() => setIsMarkMenuOpen(false)}
								>
									<button
										type="button"
										className="btn btn-ghost text-xs"
										disabled={selectedIds.size === 0}
										onClick={() => setIsMarkMenuOpen((prev) => !prev)}
									>
										Mark as…
									</button>
									{isMarkMenuOpen ? (
										<div className="menu absolute left-0 top-9 z-20">
											{STATUS_OPTIONS.map((option) => (
												<button
													type="button"
													key={option.key}
													className="menu-item"
													onClick={() => {
														setIsMarkMenuOpen(false);
														for (const id of selectedIds) {
															void setStatus(id, option.key);
														}
													}}
												>
													{option.label}
												</button>
											))}
											<button
												type="button"
												className="menu-item"
												onClick={() => {
													setIsMarkMenuOpen(false);
													for (const id of selectedIds) {
														void setStatus(id, null);
													}
												}}
											>
												Automatic
											</button>
										</div>
									) : null}
								</div>
								<button
									type="button"
									className="btn btn-ghost text-xs"
									disabled={selectedIds.size === 0}
									onClick={() => setPickerBookIds([...selectedIds])}
								>
									Add to collection…
								</button>
								<button
									type="button"
									className="btn btn-ghost text-xs"
									disabled={bulkStatus !== null || selectedIds.size === 0}
									title="Store the selected books' content on this device"
									onClick={() => void handleSelectedDownload()}
								>
									Download
								</button>
								<button
									type="button"
									className="btn btn-ghost text-xs"
									disabled={bulkStatus !== null || selectedIds.size === 0}
									title="Save the selected books' EPUB files"
									onClick={() => void handleSelectedExport()}
								>
									Export EPUBs
								</button>
								<button
									type="button"
									className="btn btn-ghost text-xs"
									disabled={bulkStatus !== null || selectedIds.size === 0}
									title="Free this device's storage; the books stay in the library"
									onClick={() => void handleSelectedRemoveDownloads()}
								>
									Remove downloads
								</button>
								<button
									type="button"
									className="btn btn-danger text-xs"
									disabled={bulkStatus !== null || selectedIds.size === 0}
									title="Permanently delete the selected books, everywhere"
									onClick={() => void handleSelectedDelete()}
								>
									Delete…
								</button>
							</div>
						</div>
					) : null}
					{bulkStatus ? (
						<p className="text-sm text-[var(--muted)]">{bulkStatus}</p>
					) : null}
					{error ? (
						<p className="text-sm text-[var(--danger)]">{error}</p>
					) : null}

					{!books ? (
						<p className="text-sm text-[var(--muted)]">Loading...</p>
					) : books.length === 0 ? (
						<div className="surface-soft rounded-2xl p-6">
							<p className="text-sm text-[var(--muted)]">
								No books yet. Upload your first EPUB to get started.
							</p>
						</div>
					) : sortBy === "series" ? (
						<div className="flex flex-col gap-8">
							{groupBySeries(sortedBooks).map((group) => (
								<section
									key={group.series ?? "::standalone"}
									className="flex flex-col gap-3"
								>
									<h2 className="text-lg">
										{group.series ?? "Other books"}
										<span className="ml-2 text-sm text-[var(--muted-2)]">
											{group.books.length}
										</span>
									</h2>
									<div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
										{group.books.map(renderCard)}
									</div>
								</section>
							))}
						</div>
					) : (
						<div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
							{sortedBooks.map(renderCard)}
						</div>
					)}
				</div>
			</div>
		</RequireAuth>
	);
}
