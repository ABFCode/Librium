import { Link } from "@tanstack/react-router";
import { useRef, useState, useSyncExternalStore } from "react";
import { useDismissable } from "../hooks/useDismissable";
import type { LocalCollection } from "../lib/db";
import {
	canPromptInstall,
	isIosInstallCandidate,
	promptInstall,
	subscribeInstallPrompt,
} from "../lib/installPrompt";
import { formatStorage } from "../lib/quotaErrors";
import { type ReadingStatus, STATUS_OPTIONS } from "../lib/status";
import { Icon } from "./Icon";

// (formatStorage's whole-MB floor exists for exactly this line: browser
// storage estimates wobble at KB granularity, which reads as jumpy noise.)

export type LibrarySort = "recent" | "title" | "author" | "progress" | "series";

const SORT_OPTIONS: { key: LibrarySort; label: string }[] = [
	{ key: "recent", label: "Recent" },
	{ key: "title", label: "Title" },
	{ key: "author", label: "Author" },
	{ key: "progress", label: "Progress" },
	{ key: "series", label: "Series" },
];

type LibraryToolbarProps = {
	// null = still loading.
	bookCount: number | null;
	downloadedCount: number;
	storageUsage: number | null;
	query: string;
	onQueryChange: (query: string) => void;
	sortBy: LibrarySort;
	onSortByChange: (sort: LibrarySort) => void;
	isSelecting: boolean;
	onToggleSelecting: () => void;
	// Non-null while a bulk operation runs (disables destructive actions).
	bulkStatus: string | null;
	onDownloadAll: () => void;
	onRemoveAllDownloads: () => void;
	onExportAll: () => void;
	onDeleteAllBooks: () => void;
	shelfStatus: "all" | ReadingStatus;
	onShelfStatusChange: (status: "all" | ReadingStatus) => void;
	downloadedOnly: boolean;
	onToggleDownloadedOnly: () => void;
	collectionFilter: string | null;
	onCollectionFilterChange: (collectionKey: string | null) => void;
	collections: LocalCollection[];
	countByCollection: Map<string, number>;
	onManageCollections: () => void;
	onOpenAccount: () => void;
};

// Presentational only: the library header (title, stats, search, sort,
// selection toggle, whole-library actions) and the shelf-filter chip row.
// All state of consequence lives in LibraryView; only menu open/closed
// state is local here.
export function LibraryToolbar({
	bookCount,
	downloadedCount,
	storageUsage,
	query,
	onQueryChange,
	sortBy,
	onSortByChange,
	isSelecting,
	onToggleSelecting,
	bulkStatus,
	onDownloadAll,
	onRemoveAllDownloads,
	onExportAll,
	onDeleteAllBooks,
	shelfStatus,
	onShelfStatusChange,
	downloadedOnly,
	onToggleDownloadedOnly,
	collectionFilter,
	onCollectionFilterChange,
	collections,
	countByCollection,
	onManageCollections,
	onOpenAccount,
}: LibraryToolbarProps) {
	const [isBulkMenuOpen, setIsBulkMenuOpen] = useState(false);
	// Install affordances: Chromium exposes a real prompt; iOS only has the
	// manual Share-sheet path, surfaced as a hint.
	const installReady = useSyncExternalStore(
		subscribeInstallPrompt,
		canPromptInstall,
		() => false,
	);
	const [isCollectionMenuOpen, setIsCollectionMenuOpen] = useState(false);
	// Menus dismiss on outside-click/Escape — hover-out closed them the
	// moment the pointer dipped past an edge.
	const bulkMenuRef = useRef<HTMLDivElement>(null);
	const collectionMenuRef = useRef<HTMLDivElement>(null);
	useDismissable(bulkMenuRef, isBulkMenuOpen, () => setIsBulkMenuOpen(false));
	useDismissable(collectionMenuRef, isCollectionMenuOpen, () =>
		setIsCollectionMenuOpen(false),
	);

	return (
		<>
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-3xl">Library</h1>
					<p className="mt-1 text-sm text-[var(--muted-2)]">
						{bookCount === null
							? "Loading…"
							: bookCount === 0
								? "No books yet"
								: `${bookCount} book${bookCount === 1 ? "" : "s"} · ${downloadedCount} on this device${storageUsage !== null ? ` · ${formatStorage(storageUsage)} used` : ""}`}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<input
						className="input h-9 w-[220px]"
						placeholder="Search titles, authors…"
						value={query}
						onChange={(event) => onQueryChange(event.target.value)}
					/>
					<div className="flex items-center gap-1">
						{SORT_OPTIONS.map((option) => (
							<button
								type="button"
								key={option.key}
								className={`chip ${sortBy === option.key ? "is-active" : ""}`}
								onClick={() => onSortByChange(option.key)}
							>
								{option.label}
							</button>
						))}
					</div>
					{bookCount !== null && bookCount > 0 ? (
						<button
							type="button"
							className={`chip is-framed ${isSelecting ? "is-active" : ""}`}
							onClick={onToggleSelecting}
						>
							{isSelecting ? "Done" : "Select"}
						</button>
					) : null}
					<button
						type="button"
						className="icon-btn"
						title="Account & storage"
						onClick={onOpenAccount}
					>
						<span className="sr-only">Account & storage</span>
						<Icon name="user" />
					</button>
					<div className="relative" ref={bulkMenuRef}>
						<button
							type="button"
							className={`icon-btn ${isBulkMenuOpen ? "is-active" : ""}`}
							onClick={() => setIsBulkMenuOpen((prev) => !prev)}
						>
							<span className="sr-only">Library actions</span>
							<Icon name="dots-horizontal" />
						</button>
						{isBulkMenuOpen ? (
							<div className="menu library-actions-menu">
								<button
									type="button"
									className="menu-item"
									onClick={() => {
										setIsBulkMenuOpen(false);
										onDownloadAll();
									}}
									disabled={
										bulkStatus !== null ||
										bookCount === null ||
										bookCount === downloadedCount
									}
									title="Store every book's content on this device (e.g. before going offline)"
								>
									Download all to this device
								</button>
								<button
									type="button"
									className="menu-item"
									onClick={() => {
										setIsBulkMenuOpen(false);
										onRemoveAllDownloads();
									}}
									disabled={bulkStatus !== null || downloadedCount === 0}
									title="Free this device's storage; the library itself is untouched"
								>
									Clear downloads
								</button>
								<button
									type="button"
									className="menu-item"
									onClick={() => {
										setIsBulkMenuOpen(false);
										onExportAll();
									}}
									disabled={bulkStatus !== null || !bookCount}
									title="Download every book's EPUB file (cloud backup copy)"
								>
									Export all EPUBs
								</button>
								<button
									type="button"
									className="menu-item"
									onClick={() => {
										setIsBulkMenuOpen(false);
										onOpenAccount();
									}}
									title="Cloud storage usage and supporter subscription"
								>
									Account & storage…
								</button>
								<button
									type="button"
									className="menu-item is-danger"
									onClick={() => {
										setIsBulkMenuOpen(false);
										onDeleteAllBooks();
									}}
									disabled={bulkStatus !== null || !bookCount}
									title="Permanently delete every book, everywhere"
								>
									Delete all books…
								</button>
								{installReady ? (
									<button
										type="button"
										className="menu-item"
										onClick={() => {
											setIsBulkMenuOpen(false);
											void promptInstall();
										}}
										title="Install Librium as an app on this device"
									>
										Install app
									</button>
								) : isIosInstallCandidate() ? (
									<div className="menu-item pointer-events-none text-[var(--muted-2)]">
										Install: Share → Add to Home Screen
									</div>
								) : null}
							</div>
						) : null}
					</div>
					<Link className="btn btn-primary h-9" to="/import">
						Upload books
					</Link>
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-1">
				<button
					type="button"
					className={`chip ${shelfStatus === "all" ? "is-active" : ""}`}
					onClick={() => onShelfStatusChange("all")}
				>
					All
				</button>
				{STATUS_OPTIONS.map((option) => (
					<button
						type="button"
						key={option.key}
						className={`chip ${shelfStatus === option.key ? "is-active" : ""}`}
						onClick={() => onShelfStatusChange(option.key)}
					>
						{option.label}
					</button>
				))}
				<span className="mx-1 h-4 w-px bg-[color-mix(in_srgb,var(--outline)_70%,transparent)]" />
				<button
					type="button"
					className={`chip ${downloadedOnly ? "is-active" : ""}`}
					title="Only books whose content is stored on this device"
					onClick={onToggleDownloadedOnly}
				>
					On this device
				</button>
				<div className="relative" ref={collectionMenuRef}>
					<button
						type="button"
						className={`chip ${collectionFilter !== null ? "is-active" : ""}`}
						onClick={() => setIsCollectionMenuOpen((prev) => !prev)}
					>
						<Icon name="folder" size={13} className="mr-1" />
						{collectionFilter !== null
							? (collections.find((c) => c.clientKey === collectionFilter)
									?.name ?? "Collection")
							: "Collection"}
					</button>
					{isCollectionMenuOpen ? (
						<div className="menu library-collection-menu">
							<button
								type="button"
								className="menu-item is-checkable"
								onClick={() => {
									setIsCollectionMenuOpen(false);
									onCollectionFilterChange(null);
								}}
							>
								<span className="menu-check">
									{collectionFilter === null ? (
										<Icon name="check" size={12} />
									) : null}
								</span>
								All books
							</button>
							{collections.map((collection) => (
								<button
									type="button"
									key={collection.clientKey}
									className="menu-item is-checkable"
									onClick={() => {
										setIsCollectionMenuOpen(false);
										onCollectionFilterChange(collection.clientKey);
									}}
								>
									<span className="menu-check">
										{collectionFilter === collection.clientKey ? (
											<Icon name="check" size={12} />
										) : null}
									</span>
									<span className="min-w-0 flex-1 truncate text-left">
										{collection.name}
									</span>
									<span className="text-xs text-[var(--muted-2)]">
										{countByCollection.get(collection.clientKey) ?? 0}
									</span>
								</button>
							))}
							<div className="menu-heading">Manage</div>
							<button
								type="button"
								className="menu-item"
								onClick={() => {
									setIsCollectionMenuOpen(false);
									onManageCollections();
								}}
							>
								Manage collections…
							</button>
						</div>
					) : null}
				</div>
			</div>
		</>
	);
}
