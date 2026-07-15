import { Link, useNavigate } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { useLiveQuery } from "dexie-react-hooks";
import type { CSSProperties } from "react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { api } from "../../convex/_generated/api";
import { useBookmarkSync } from "../hooks/useBookmarkSync";
import { useProgressSync } from "../hooks/useProgressSync";
import { useUserSettings } from "../hooks/useUserSettings";
import {
	type BlockPayload,
	blockToText,
	type InlinePayload,
} from "../lib/blockText";
import {
	db,
	deleteLocalBook,
	getLocalBlocks,
	localSectionKey,
	PARSER_VERSION,
} from "../lib/db";
import { bookProgress } from "../lib/progress";
import {
	anchorScrollTop,
	findAnchor,
	visibleAnchorScrollTop,
} from "../lib/readerAnchors";
import { normalizeAnchor, normalizeHref } from "../lib/readerLinks";
import { scanSections } from "../lib/searchScan";
import { seedBookFromR2 } from "../lib/seedBook";
import { Icon } from "./Icon";
import { ReaderBlocks } from "./ReaderBlocks";
import { ReaderPreferencesModal } from "./ReaderPreferencesModal";
import { RequireAuth } from "./RequireAuth";

// Paragraph-shaped shimmer — text placeholders flash, shapes don't. Shared
// by the chapter-loading and book-downloading states.
function ParagraphSkeleton() {
	return (
		<div className="flex flex-col">
			{[94, 100, 97, 88, 99, 91, 58].map((width) => (
				<div
					key={`line-${width}`}
					className="mb-[0.9em] h-[0.9em] animate-pulse rounded-full bg-[color-mix(in_srgb,var(--reader-muted)_16%,transparent)]"
					style={{ width: `${width}%` }}
				/>
			))}
		</div>
	);
}

type ReaderSection = {
	_id: string;
	title: string;
	orderIndex: number;
	href?: string;
	anchor?: string;
};

type ReaderChunk = {
	id: string;
	content: string;
};

type ReaderExperienceProps = {
	bookId: string;
};

// Keep the interaction and layout breakpoints identical. Narrow windows use
// the phone reader regardless of pointer type; coarse-pointer devices keep it
// through common landscape-phone widths.
const PHONE_READER_MEDIA =
	"(max-width: 599px), (pointer: coarse) and (max-width: 899px)";

export function ReaderExperience({ bookId }: ReaderExperienceProps) {
	const readerDb = db;
	const { isAuthenticated } = useConvexAuth();
	const canQuery = isAuthenticated;
	const navigate = useNavigate();

	// If the book was deleted (possibly from another device) while open here,
	// purge the local copy and return to the library instead of erroring.
	const remoteBook = useQuery(
		api.books.getBook,
		canQuery ? { bookId: bookId as never } : "skip",
	);
	useEffect(() => {
		if (!canQuery || remoteBook !== null) {
			return;
		}
		void (async () => {
			try {
				await deleteLocalBook(bookId, readerDb);
			} catch {
				// Purge retried by the library reconcile.
			}
			void navigate({ to: "/library" });
		})();
	}, [canQuery, remoteBook, bookId, navigate]);
	// Local-first: IndexedDB is the only content source. Books not on this
	// device are seeded from R2 (download EPUB → re-parse → IndexedDB) below.
	const localSectionRows = useLiveQuery(
		() => readerDb.sections.where("bookId").equals(bookId).sortBy("orderIndex"),
		[bookId],
	);
	// Book title for the panel header (local row works offline).
	const localBookRow = useLiveQuery(() => readerDb.books.get(bookId), [bookId]);
	const bookTitle = localBookRow?.title ?? remoteBook?.title ?? "";
	const sections: ReaderSection[] | undefined = useMemo(() => {
		if (!localSectionRows) {
			return undefined;
		}
		return localSectionRows.map((row) => ({
			_id: localSectionKey(bookId, row.orderIndex),
			title: row.title,
			orderIndex: row.orderIndex,
			href: row.href,
			anchor: row.anchor,
		}));
	}, [localSectionRows, bookId]);

	// Device seeding (ROADMAP Phase 5): if this device has no local content —
	// or its blocks were parsed by an older @abfcode/spine — download the raw
	// EPUB from R2 and re-parse it locally.
	const convex = useConvex();
	const [isSeeding, setIsSeeding] = useState(false);
	const [seedError, setSeedError] = useState<string | null>(null);
	// Streamed download progress for the seeding state ({loaded, total?}).
	const [seedProgress, setSeedProgress] = useState<{
		loaded: number;
		total?: number;
	} | null>(null);
	const seedingRef = useRef(false);
	useEffect(() => {
		if (!canQuery || !remoteBook || seedingRef.current) {
			return;
		}
		if (localSectionRows === undefined) {
			return;
		}
		if (!remoteBook.epubKey) {
			return;
		}
		void (async () => {
			const localBook = await readerDb.books.get(bookId);
			const hasContent = localSectionRows.length > 0;
			const stale =
				hasContent &&
				!!localBook?.parserVersion &&
				localBook.parserVersion !== PARSER_VERSION;
			if (hasContent && !stale) {
				return;
			}
			seedingRef.current = true;
			setIsSeeding(true);
			setSeedError(null);
			setSeedProgress(null);
			try {
				await seedBookFromR2(convex, bookId, {
					replace: stale,
					database: readerDb,
					onProgress: (loaded, total) => setSeedProgress({ loaded, total }),
				});
			} catch (err) {
				setSeedError(
					err instanceof Error ? err.message : "Failed to download book",
				);
			} finally {
				seedingRef.current = false;
				setIsSeeding(false);
				setSeedProgress(null);
			}
		})();
	}, [canQuery, remoteBook, localSectionRows, bookId, convex]);

	// Local-first progress (ROADMAP Phase 4): every edit lands in IndexedDB
	// first and syncs to Convex via LWW on section indexes.
	const { effectiveProgress, saveProgress } = useProgressSync({
		bookId,
		canQuery,
	});
	const isProgressReady = effectiveProgress !== undefined;

	// Local-first bookmarks: create/delete work offline; tombstones propagate
	// deletes across devices.
	const { bookmarks, createBookmark, deleteBookmark } = useBookmarkSync({
		bookId,
		canQuery,
	});
	const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
	const [chunks, setChunks] = useState<ReaderChunk[]>([]);
	const [blocks, setBlocks] = useState<BlockPayload[] | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [isTocOpen, setIsTocOpen] = useState(false);
	const parentRef = useRef<HTMLDivElement | null>(null);
	// Immersive chrome (phone): the top bar and a bottom control bar hide while
	// you read and return when you scroll to the top or tap the page. Desktop
	// keeps its always-on top bar (CSS gates the hide to phone widths; the tap
	// toggle is touch-only), so this state is inert there.
	const [chromeHidden, setChromeHidden] = useState(false);
	const [isPhoneReader, setIsPhoneReader] = useState(() =>
		typeof window === "undefined"
			? false
			: window.matchMedia(PHONE_READER_MEDIA).matches,
	);
	const chromeScrollRef = useRef({ lastTop: 0, downwardStartTop: 0 });

	useEffect(() => {
		const media = window.matchMedia(PHONE_READER_MEDIA);
		const sync = () => {
			setIsPhoneReader(media.matches);
			if (!media.matches) {
				setChromeHidden(false);
			}
		};
		sync();
		media.addEventListener("change", sync);
		return () => media.removeEventListener("change", sync);
	}, []);

	// A clean touch tap on the page (not a scroll, long-press, selection, or
	// link/image) toggles the chrome. On CLICK, not pointerup: toggling on
	// pointerup let the tap's own synthetic click land on freshly-rendered
	// chrome and immediately re-toggle it (verified). pointerdown captures the
	// touch context; the single following click does the toggle.
	const touchTapRef = useRef<{
		x: number;
		y: number;
		at: number;
		scrollTop: number;
		didScroll: boolean;
	} | null>(null);
	const handleContentPointerDown = (event: React.PointerEvent) => {
		touchTapRef.current =
			event.pointerType === "touch" && isPhoneReader
				? {
						x: event.clientX,
						y: event.clientY,
						at: Date.now(),
						scrollTop: parentRef.current?.scrollTop ?? 0,
						didScroll: false,
					}
				: null;
	};
	const handleContentClick = (event: React.MouseEvent) => {
		const start = touchTapRef.current;
		touchTapRef.current = null;
		if (!start) {
			return; // not a touch gesture (mouse/keyboard) — desktop unaffected
		}
		if (Date.now() - start.at > 400) {
			return; // long press — selection, not a tap
		}
		if (
			start.didScroll ||
			Math.abs(
				(parentRef.current?.scrollTop ?? start.scrollTop) - start.scrollTop,
			) > 6 ||
			Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12
		) {
			return; // moved between down and up — a scroll, not a tap
		}
		const target = event.target as HTMLElement;
		if (target.closest("a, button, img")) {
			return; // interactive content owns its taps
		}
		if (window.getSelection()?.toString()) {
			return; // finishing a selection
		}
		const rect = event.currentTarget.getBoundingClientRect();
		const horizontal = (event.clientX - rect.left) / rect.width;
		const vertical = (event.clientY - rect.top) / rect.height;
		if (
			horizontal < 0.3 ||
			horizontal > 0.7 ||
			vertical < 0.2 ||
			vertical > 0.8
		) {
			return;
		}
		const top = parentRef.current?.scrollTop ?? 0;
		chromeScrollRef.current = { lastTop: top, downwardStartTop: top };
		setChromeHidden((hidden) => !hidden);
	};
	const [activeSideTab, setActiveSideTab] = useState<
		"toc" | "search" | "bookmarks"
	>("toc");
	const [isPrefsOpen, setIsPrefsOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	// Which section the currently rendered blocks belong to. Restore/jump
	// effects must not touch the DOM until it matches sectionId — otherwise a
	// cross-section jump anchors against the previous chapter's content.
	const [loadedSectionId, setLoadedSectionId] = useState<string | null>(null);
	const activeSectionRef = useRef<string | null>(null);
	const lastProgressAtRef = useRef<number>(0);
	const trailingEmitRef = useRef<number | null>(null);
	// Anchor to apply after a cross-section jump (search result / bookmark).
	const pendingChunkRef = useRef<{
		blockIndex: number;
		fraction: number;
	} | null>(null);
	const loadingSectionRef = useRef<string | null>(null);
	const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
	const restoredFromUserBookRef = useRef(false);
	// Where the initial restore put the view, and when we mounted — used to
	// allow cross-device hand-off correction while the reader is still showing
	// that restored location (explicit navigation changes it).
	const initialRestoreTargetRef = useRef<string | null>(null);
	const initialProgressRef = useRef(false);
	const scrollRestoredRef = useRef<string | null>(null);
	// Restore is applied synchronously, then silently re-anchored while fonts
	// and images settle — unless the user has scrolled in the meantime, or a
	// newer restore has bumped the token (invalidates stale async closures).
	const lastAppliedScrollTopRef = useRef(0);
	const userScrolledSinceRestoreRef = useRef(false);
	const anchorTokenRef = useRef(0);
	const tocListRef = useRef<HTMLDivElement | null>(null);
	const fontsReadyRef = useRef<Promise<void> | null>(null);
	const {
		fontScale,
		lineHeight,
		contentWidth,
		theme,
		fontFamily,
		setFontScale,
		setLineHeight,
		setContentWidth,
		setTheme,
		setFontFamily,
	} = useUserSettings({ pauseSync: isPrefsOpen });

	// Note: the chapters panel is a transient popover — it always starts
	// closed. (The old docked sidebar persisted open-state to localStorage and
	// defaulted open on desktop; that machinery is gone.)

	const sectionId = activeSectionId ?? null;

	useEffect(() => {
		activeSectionRef.current = sectionId;
	}, [sectionId]);

	const activeSection = useMemo(() => {
		if (!sections || !sectionId) {
			return null;
		}
		return sections.find((section) => section._id === sectionId) ?? null;
	}, [sections, sectionId]);

	const fontSize = 16 + fontScale * 2;
	const themeClass =
		theme === "paper"
			? "reader-theme-paper"
			: theme === "sepia"
				? "reader-theme-sepia"
				: "reader-theme-night";

	const activeIndex = useMemo(() => {
		if (!sections || !sectionId) {
			return -1;
		}
		return sections.findIndex((section) => section._id === sectionId);
	}, [sections, sectionId]);

	const sectionLinkIndex = useMemo(() => {
		const map = new Map<string, string>();
		if (!sections) {
			return map;
		}
		for (const section of sections) {
			const base = normalizeHref(section.href);
			const anchor = normalizeAnchor(section.anchor);
			if (base && anchor) {
				map.set(`${base}#${anchor}`, section._id);
			}
			if (base) {
				map.set(base, section._id);
			}
			if (anchor) {
				map.set(`#${anchor}`, section._id);
			}
		}
		return map;
	}, [sections]);

	const imageHrefs = useMemo(() => {
		if (!blocks || blocks.length === 0) {
			return [];
		}
		const set = new Set<string>();
		const collectInlines = (inlines?: InlinePayload[]) => {
			if (!inlines) {
				return;
			}
			for (const inline of inlines) {
				if (inline.kind === "image" && inline.src) {
					set.add(inline.src);
				}
			}
		};
		for (const block of blocks) {
			collectInlines(block.inlines);
			if (block.figure) {
				collectInlines(block.figure.images);
				collectInlines(block.figure.caption);
			}
			if (block.table) {
				for (const row of block.table.rows) {
					for (const cell of row.cells) {
						collectInlines(cell.inlines);
					}
				}
			}
		}
		return Array.from(set);
	}, [blocks]);

	// Images: object URLs from IndexedDB blobs (stored at import/seed time).
	const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

	useEffect(() => {
		let cancelled = false;
		const created: string[] = [];
		if (imageHrefs.length === 0) {
			setImageUrls({});
			return;
		}
		void (async () => {
			const local: Record<string, string> = {};
			try {
				const rows = await readerDb.images.bulkGet(
					imageHrefs.map((href) => [bookId, href] as [string, string]),
				);
				rows.forEach((row, i) => {
					if (row) {
						const url = URL.createObjectURL(row.blob);
						local[imageHrefs[i]] = url;
						created.push(url);
					}
				});
			} catch {
				// IndexedDB unavailable — images simply don't render.
			}
			if (cancelled) {
				for (const url of created) {
					URL.revokeObjectURL(url);
				}
				return;
			}
			setImageUrls(local);
		})();
		return () => {
			cancelled = true;
			for (const url of created) {
				URL.revokeObjectURL(url);
			}
		};
	}, [imageHrefs, bookId]);

	const goToSectionStart = useCallback((targetId: string) => {
		if (targetId === activeSectionRef.current) {
			const container = parentRef.current;
			if (container) {
				container.scrollTop = 0;
				lastAppliedScrollTopRef.current = container.scrollTop;
				chromeScrollRef.current = { lastTop: 0, downwardStartTop: 0 };
			}
			return;
		}
		// An explicit chapter choice always means section start. Opening a book
		// restores progress; search and bookmarks install their own pending anchor.
		pendingChunkRef.current = { blockIndex: 0, fraction: 0 };
		setActiveSectionId(targetId);
	}, []);

	const goToSection = useCallback(
		(index: number) => {
			if (!sections || index < 0 || index >= sections.length) {
				return;
			}
			goToSectionStart(sections[index]._id);
		},
		[sections, goToSectionStart],
	);

	const goNext = useCallback(() => {
		if (activeIndex < 0) {
			return;
		}
		goToSection(activeIndex + 1);
	}, [activeIndex, goToSection]);

	const goPrev = useCallback(() => {
		if (activeIndex < 0) {
			return;
		}
		goToSection(activeIndex - 1);
	}, [activeIndex, goToSection]);

	useEffect(() => {
		if (!sections || sections.length === 0) {
			return;
		}
		// Wait for the merged progress view (local is instant; online adds a
		// brief wait for the remote copy) so we restore to the right chapter.
		if (effectiveProgress === undefined) {
			return;
		}
		if (effectiveProgress && !restoredFromUserBookRef.current) {
			const match = sections[effectiveProgress.sectionIndex];
			if (match && match._id !== activeSectionId) {
				setActiveSectionId(match._id);
				initialRestoreTargetRef.current = match._id;
				restoredFromUserBookRef.current = true;
				return;
			}
			restoredFromUserBookRef.current = true;
		}
		if (!activeSectionId) {
			initialRestoreTargetRef.current = sections[0]._id;
			setActiveSectionId(sections[0]._id);
		}
	}, [sections, activeSectionId, effectiveProgress]);

	// Cross-device hand-off: whenever a newer remote position arrives and this
	// reader is still showing the location it originally restored, follow it.
	// This cannot be time-limited: an overnight/suspended tab may reconnect many
	// hours later. Explicit navigation changes activeSectionId first, so a reader
	// who deliberately moved elsewhere is not yanked back by this effect.
	useEffect(() => {
		if (!sections || sections.length === 0 || !effectiveProgress) {
			return;
		}
		if (!restoredFromUserBookRef.current) {
			return;
		}
		if (effectiveProgress.source !== "remote") {
			return;
		}
		if (
			!activeSectionId ||
			activeSectionId !== initialRestoreTargetRef.current
		) {
			return;
		}
		const target = sections[effectiveProgress.sectionIndex];
		if (!target || target._id === activeSectionId) {
			return;
		}
		initialRestoreTargetRef.current = target._id;
		setActiveSectionId(target._id);
	}, [sections, effectiveProgress, activeSectionId]);

	const loadSection = async (targetId: string | null) => {
		if (!targetId) {
			return;
		}
		loadingSectionRef.current = targetId;
		setIsLoading(true);

		// Blocks come from IndexedDB only — content is always local (imported
		// here or seeded from R2); no network on the read path.
		const meta = sections?.find((section) => section._id === targetId);
		if (meta) {
			const local = await getLocalBlocks(bookId, meta.orderIndex);
			if (local && activeSectionRef.current === targetId) {
				setBlocks(local as BlockPayload[]);
				setChunks([]);
				setLoadedSectionId(targetId);
			}
		}
		if (loadingSectionRef.current === targetId) {
			setIsLoading(false);
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: load exactly once per section change; loadSection reads the render-current sections list
	useEffect(() => {
		void loadSection(sectionId);
	}, [sectionId]);

	useEffect(() => {
		let timeout: number | undefined;
		if (isLoading) {
			timeout = window.setTimeout(() => {
				setShowLoadingOverlay(true);
			}, 250);
		} else {
			setShowLoadingOverlay(false);
		}
		return () => {
			if (timeout) {
				window.clearTimeout(timeout);
			}
		};
	}, [isLoading]);

	const emitProgress = () => {
		if (!sectionId || !parentRef.current || activeIndex < 0) {
			return;
		}
		// Do not overwrite saved progress before the initial restore has run.
		if (effectiveProgress === undefined) {
			return;
		}
		if (effectiveProgress && !restoredFromUserBookRef.current) {
			return;
		}
		// A newer cross-device chapter can arrive one render before the handoff
		// effect switches activeSectionId. Never let pagehide, a layout scroll, or
		// another incidental event save the still-visible stale chapter using the
		// newly adopted server version; that turns a harmless stale tab into a
		// destructive "new" write.
		if (
			effectiveProgress?.source === "remote" &&
			effectiveProgress.sectionIndex !== activeIndex &&
			activeSectionId === initialRestoreTargetRef.current
		) {
			return;
		}
		const anchor = findAnchor(parentRef.current);
		// Local write is instant and offline-capable; the sync hook pushes to
		// Convex (LWW) whenever a connection and the section's Convex id exist.
		void saveProgress({
			sectionIndex: activeIndex,
			blockIndex: anchor.blockIndex,
			blockOffset: anchor.fraction,
			sectionFraction: anchor.sectionFraction,
		});
	};

	const waitForFonts = () => {
		if (typeof document === "undefined") {
			return Promise.resolve();
		}
		if (!fontsReadyRef.current) {
			const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
			fontsReadyRef.current = fonts?.ready
				? fonts.ready.then(() => undefined).catch(() => undefined)
				: Promise.resolve();
		}
		return fontsReadyRef.current;
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: the scroll listener rebinds when the scroller can mount, per section, or when the phone layout changes; emitProgress is deliberately the bind-time closure (its guards read refs), and cleanup must cancel trailing emits on section change
	useEffect(() => {
		const container = parentRef.current;
		if (!container) {
			return;
		}
		chromeScrollRef.current = {
			lastTop: container.scrollTop,
			downwardStartTop: container.scrollTop,
		};
		const handleScroll = () => {
			const cur = container.scrollTop;
			const touch = touchTapRef.current;
			if (touch && Math.abs(cur - touch.scrollTop) > 6) {
				touch.didScroll = true;
			}
			if (isPhoneReader) {
				// Accumulate a deliberate downward gesture across small scroll events.
				// Phone momentum cadence varies wildly, so no individual event decides
				// chrome visibility. Scrolling upward mid-page remains tap-controlled.
				const tracking = chromeScrollRef.current;
				if (cur < 48) {
					setChromeHidden(false);
					tracking.downwardStartTop = cur;
				} else if (cur < tracking.lastTop) {
					tracking.downwardStartTop = cur;
				} else if (
					cur > tracking.lastTop &&
					cur - tracking.downwardStartTop >= 24
				) {
					setChromeHidden(true);
					tracking.downwardStartTop = cur;
				}
				tracking.lastTop = cur;
			}
			// Programmatic restores land exactly on lastAppliedScrollTop; anything
			// else is the user, which cancels pending silent re-anchors.
			if (Math.abs(container.scrollTop - lastAppliedScrollTopRef.current) > 4) {
				userScrolledSinceRestoreRef.current = true;
			}
			// Trailing emit: without it the throttle can leave the saved anchor
			// several screens behind after a fast scroll, and anything that
			// re-applies saved progress (font-size change) yanks the view back.
			if (trailingEmitRef.current !== null) {
				window.clearTimeout(trailingEmitRef.current);
			}
			trailingEmitRef.current = window.setTimeout(() => {
				trailingEmitRef.current = null;
				lastProgressAtRef.current = Date.now();
				emitProgress();
			}, 300);
			const now = Date.now();
			if (now - lastProgressAtRef.current < 800) {
				return;
			}
			lastProgressAtRef.current = now;
			emitProgress();
		};
		container.addEventListener("scroll", handleScroll);
		return () => {
			container.removeEventListener("scroll", handleScroll);
			if (trailingEmitRef.current !== null) {
				window.clearTimeout(trailingEmitRef.current);
				trailingEmitRef.current = null;
			}
		};
	}, [sectionId, isPhoneReader, isProgressReady]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: listeners rebind when the save-relevant inputs change so emitProgress's closure stays fresh; emitProgress itself is a new identity every render
	useEffect(() => {
		const handleVisibility = () => {
			if (document.visibilityState === "hidden") {
				emitProgress();
			}
		};
		window.addEventListener("pagehide", emitProgress);
		document.addEventListener("visibilitychange", handleVisibility);
		return () => {
			window.removeEventListener("pagehide", emitProgress);
			document.removeEventListener("visibilitychange", handleVisibility);
		};
	}, [sectionId, effectiveProgress]);

	// Layout inputs (font size/family, line height, width) reflow the text and
	// strand the scroll position — including on load, when synced settings
	// arrive a beat after the initial restore. Re-apply the saved anchor; the
	// fraction makes it exact in the new layout.
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs only when a layout input reflows the text; the anchor inputs are read as of that render on purpose
	useLayoutEffect(() => {
		const container = parentRef.current;
		if (!container || !sectionId || !effectiveProgress) {
			return;
		}
		// Only after the initial restore has anchored this section.
		if (scrollRestoredRef.current !== sectionId) {
			return;
		}
		if (effectiveProgress.sectionIndex !== activeIndex) {
			return;
		}
		const top = anchorScrollTop(
			container,
			effectiveProgress.blockIndex,
			effectiveProgress.blockOffset,
		);
		if (top === null) {
			return;
		}
		container.scrollTop = top;
		lastAppliedScrollTopRef.current = container.scrollTop;
		chromeScrollRef.current = {
			lastTop: container.scrollTop,
			downwardStartTop: container.scrollTop,
		};
	}, [fontSize, lineHeight, contentWidth, fontFamily]);

	// Persist position on arrival at a section — a chapter switch with no
	// scrolling would otherwise never save (progress only emitted on scroll
	// and tab-hide before this). Wait for the section's own content: emitting
	// against the previous chapter's DOM would save a bogus anchor.
	// biome-ignore lint/correctness/useExhaustiveDependencies: emit once per content arrival; emitProgress is a new identity every render and must not retrigger this
	useEffect(() => {
		if (loadedSectionId !== sectionId) {
			return;
		}
		if (!blocks || blocks.length === 0) {
			return;
		}
		emitProgress();
	}, [loadedSectionId, sectionId, blocks]);

	const tocVirtualizer = useVirtualizer({
		count: sections?.length ?? 0,
		getScrollElement: () => tocListRef.current,
		estimateSize: () => 64,
		overscan: 10,
	});

	useEffect(() => {
		if (!isTocOpen || activeSideTab !== "toc" || activeIndex < 0) {
			return;
		}
		const id = window.requestAnimationFrame(() => {
			tocVirtualizer.scrollToIndex(activeIndex, { align: "center" });
		});
		return () => window.cancelAnimationFrame(id);
	}, [isTocOpen, activeSideTab, activeIndex, tocVirtualizer]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: the deps are the exact invalidation set for anchoring — re-running on blocks/callback identity changes would re-yank the scroll position
	useLayoutEffect(() => {
		const container = parentRef.current;
		if (!container || !sectionId) {
			return;
		}
		// Never anchor against another section's DOM: after a section switch the
		// old blocks stay mounted until loadSection finishes, and consuming a
		// pending jump (or restoring) against them lands at a bogus position.
		if (loadedSectionId !== sectionId) {
			return;
		}
		const hasContent = (blocks && blocks.length > 0) || chunks.length > 0;
		if (!hasContent) {
			return;
		}
		const applyScroll = (top: number) => {
			container.scrollTop = top;
			lastAppliedScrollTopRef.current = container.scrollTop;
			chromeScrollRef.current = {
				lastTop: container.scrollTop,
				downwardStartTop: container.scrollTop,
			};
		};
		if (pendingChunkRef.current !== null) {
			const pending = pendingChunkRef.current;
			pendingChunkRef.current = null;
			anchorTokenRef.current++;
			applyScroll(
				visibleAnchorScrollTop(
					container,
					pending.blockIndex,
					pending.fraction,
				) ?? 0,
			);
			scrollRestoredRef.current = sectionId;
			return;
		}
		if (
			effectiveProgress &&
			activeIndex >= 0 &&
			effectiveProgress.sectionIndex === activeIndex
		) {
			if (scrollRestoredRef.current === sectionId) {
				return;
			}
			const targetIndex = effectiveProgress.blockIndex;
			const targetFraction = effectiveProgress.blockOffset;
			const applyAnchor = () => {
				const top = anchorScrollTop(container, targetIndex, targetFraction);
				if (top === null) {
					return false;
				}
				applyScroll(top);
				return true;
			};
			userScrolledSinceRestoreRef.current = false;
			if (!applyAnchor()) {
				applyScroll(0);
			}
			scrollRestoredRef.current = sectionId;
			// Content stays visible; if fonts or images settle and shift layout,
			// silently re-apply the anchor — unless the user has scrolled away or
			// a newer restore has run (token invalidates stale async closures,
			// e.g. navigating A→B→A before A's fonts/images resolved).
			const token = ++anchorTokenRef.current;
			const reanchor = () => {
				if (
					anchorTokenRef.current === token &&
					!userScrolledSinceRestoreRef.current
				) {
					applyAnchor();
				}
			};
			void waitForFonts().then(reanchor);
			const onAssetLoad = (event: Event) => {
				if ((event.target as HTMLElement | null)?.tagName === "IMG") {
					reanchor();
				}
			};
			container.addEventListener("load", onAssetLoad, true);
			window.setTimeout(() => {
				container.removeEventListener("load", onAssetLoad, true);
			}, 3000);
			return;
		}
		if (effectiveProgress === null && !initialProgressRef.current) {
			initialProgressRef.current = true;
			void saveProgress({
				sectionIndex: activeIndex >= 0 ? activeIndex : 0,
				blockIndex: 0,
				blockOffset: 0,
			});
		}
		anchorTokenRef.current++;
		applyScroll(0);
		scrollRestoredRef.current = null;
	}, [
		sectionId,
		loadedSectionId,
		chunks.length,
		blocks?.length,
		effectiveProgress,
		activeIndex,
	]);

	// ── Whole-book search ──────────────────────────────────────────────────────
	// Scans every section's text from IndexedDB. Built to stay responsive on
	// 2,000-chapter novels: the text cache is built once per book (blocks →
	// plain strings, chunked with event-loop yields), scans are debounced,
	// cancellable, capped, and also yield between chunks.
	const SEARCH_RESULT_CAP = 50;
	const [searchResults, setSearchResults] = useState<
		Array<{ sectionIndex: number; blockIndex: number; snippet: string }>
	>([]);
	const [isSearching, setIsSearching] = useState(false);
	// Keyed by the live-query rows' identity: a re-parse or seeding batch
	// yields a new array, invalidating the cache even when the section count
	// is unchanged. Text is cached pre-lowercased so scans are pure indexOf.
	const bookTextCacheRef = useRef<{
		rows: unknown;
		perSection: { texts: string[]; lower: string[] }[];
	} | null>(null);
	const searchTokenRef = useRef(0);

	// Drop the previous book's cache on navigation so ~MBs of strings don't
	// linger while reading a different book.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the cache is invalidated per book
	useEffect(() => {
		bookTextCacheRef.current = null;
	}, [bookId]);

	const ensureBookText = async (token: number) => {
		const rows = localSectionRows;
		if (!rows || rows.length === 0) {
			return null;
		}
		if (bookTextCacheRef.current?.rows === rows) {
			return bookTextCacheRef.current.perSection;
		}
		// The rows (with blocks) are already in memory via the live query — no
		// second IndexedDB read.
		const perSection: { texts: string[]; lower: string[] }[] = [];
		for (let i = 0; i < rows.length; i++) {
			const texts = (rows[i].blocks ?? []).map((block) =>
				blockToText(block as BlockPayload),
			);
			perSection[i] = { texts, lower: texts.map((t) => t.toLowerCase()) };
			if (i % 100 === 99) {
				await new Promise((resolve) => setTimeout(resolve));
				if (searchTokenRef.current !== token) {
					return null;
				}
			}
		}
		bookTextCacheRef.current = { rows, perSection };
		return perSection;
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: re-scan when the query or the underlying rows change; ensureBookText is identity-unstable but reads exactly those rows
	useEffect(() => {
		const query = searchQuery.trim().toLowerCase();
		if (query.length < 2) {
			setSearchResults([]);
			setIsSearching(false);
			return;
		}
		const token = ++searchTokenRef.current;
		const timer = window.setTimeout(() => {
			void (async () => {
				setIsSearching(true);
				try {
					const perSection = await ensureBookText(token);
					if (!perSection || searchTokenRef.current !== token) {
						return;
					}
					const out: Array<{
						sectionIndex: number;
						blockIndex: number;
						snippet: string;
					}> = [];
					// Scan in section windows, yielding to the event loop between
					// them so huge books never block the main thread.
					const WINDOW = 200;
					for (
						let s = 0;
						s < perSection.length && out.length < SEARCH_RESULT_CAP;
						s += WINDOW
					) {
						out.push(
							...scanSections(
								perSection,
								query,
								SEARCH_RESULT_CAP - out.length,
								s,
								Math.min(s + WINDOW, perSection.length),
							),
						);
						await new Promise((resolve) => setTimeout(resolve));
						if (searchTokenRef.current !== token) {
							return;
						}
					}
					if (searchTokenRef.current === token) {
						setSearchResults(out);
					}
				} finally {
					if (searchTokenRef.current === token) {
						setIsSearching(false);
					}
				}
			})();
		}, 250);
		return () => window.clearTimeout(timer);
	}, [searchQuery, bookId, localSectionRows]);

	const jumpToSearchResult = (result: {
		sectionIndex: number;
		blockIndex: number;
	}) => {
		const targetId = sections?.[result.sectionIndex]?._id ?? null;
		if (!targetId) {
			return;
		}
		setIsTocOpen(false);
		if (targetId === sectionId) {
			scrollToChunk(result.blockIndex);
			return;
		}
		pendingChunkRef.current = { blockIndex: result.blockIndex, fraction: 0 };
		setActiveSectionId(targetId);
	};

	const scrollToChunk = (index: number) => {
		const container = parentRef.current;
		if (!container) {
			return;
		}
		const top = visibleAnchorScrollTop(container, index, 0);
		if (top !== null) {
			container.scrollTo({ top, behavior: "smooth" });
		}
	};

	const handleCreateBookmark = async () => {
		if (!sectionId || !parentRef.current || activeIndex < 0) {
			return;
		}
		// Same layout-independent anchor as progress: block index + fraction
		// within it ("offset" carries the fraction).
		const anchor = findAnchor(parentRef.current);
		const label = window.prompt("Bookmark label (optional)") ?? undefined;
		await createBookmark({
			sectionIndex: activeIndex,
			blockIndex: anchor.blockIndex,
			offset: anchor.fraction,
			label: label && label.length > 0 ? label : undefined,
		});
		setActiveSideTab("bookmarks");
		setIsTocOpen(true);
	};

	useEffect(() => {
		const handleKey = (event: KeyboardEvent) => {
			if (
				event.target instanceof HTMLInputElement ||
				event.target instanceof HTMLTextAreaElement ||
				event.target instanceof HTMLSelectElement
			) {
				return;
			}
			if (event.key === "ArrowRight") {
				event.preventDefault();
				goNext();
			}
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				goPrev();
			}
			if (event.key === "Escape" && !isPrefsOpen) {
				// The prefs modal has its own Escape handling — don't also close
				// the chapters panel underneath it.
				setIsTocOpen(false);
			}
		};

		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [goNext, goPrev, isPrefsOpen]);

	const tabItems = [
		{
			key: "toc" as const,
			label: "Chapters",
			icon: <Icon name="menu" />,
		},
		{
			key: "search" as const,
			label: "Search",
			icon: <Icon name="search" />,
		},
		{
			key: "bookmarks" as const,
			label: "Bookmarks",
			icon: <Icon name="bookmark" />,
		},
	];

	const tocListClass = "reader-scroll min-h-0 flex-1 overflow-auto pr-1";

	const tabControls = (
		<div className="flex gap-1">
			{tabItems.map((tab) => (
				<button
					type="button"
					key={tab.key}
					className={`chip ${activeSideTab === tab.key ? "is-active" : ""}`}
					onClick={() => setActiveSideTab(tab.key)}
				>
					{tab.label}
				</button>
			))}
		</div>
	);

	const sidebarPanels = (
		<>
			{activeSideTab === "toc" ? (
				!sections ? (
					<div
						role="status"
						aria-label="Loading chapters"
						className="flex flex-col gap-2 py-1"
					>
						{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
							<div
								key={`toc-line-${i}`}
								className="h-8 animate-pulse rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--surface-3)_60%,transparent)]"
								style={{ opacity: 1 - i * 0.1 }}
							/>
						))}
					</div>
				) : sections.length === 0 ? (
					<p className="text-sm text-[var(--muted)]">
						No sections yet. Parser output not loaded.
					</p>
				) : (
					<div className={tocListClass} ref={tocListRef}>
						<div
							style={{
								height: tocVirtualizer.getTotalSize(),
								position: "relative",
								width: "100%",
							}}
						>
							{tocVirtualizer.getVirtualItems().map((vi) => {
								const section = sections[vi.index];
								const isActive = section._id === sectionId;
								return (
									<button
										type="button"
										key={section._id}
										data-section-id={section._id}
										data-index={vi.index}
										ref={tocVirtualizer.measureElement}
										className={`reader-row ${isActive ? "is-active" : ""}`}
										onClick={() => {
											goToSection(vi.index);
											setIsTocOpen(false);
										}}
										disabled={isActive}
										style={{
											position: "absolute",
											top: 0,
											left: 0,
											width: "100%",
											transform: `translateY(${vi.start}px)`,
										}}
									>
										{section.title}
									</button>
								);
							})}
						</div>
					</div>
				)
			) : null}

			{activeSideTab === "search" ? (
				<div className="flex min-h-0 flex-1 flex-col gap-3">
					<input
						className="input"
						placeholder="Search the whole book…"
						value={searchQuery}
						onChange={(event) => setSearchQuery(event.target.value)}
					/>
					{searchResults.length === 0 ? (
						<p className="text-sm text-[var(--muted)]">
							{isSearching
								? "Searching…"
								: searchQuery.trim().length >= 2
									? "No matches."
									: "Type at least two characters."}
						</p>
					) : (
						<div className="reader-scroll flex min-h-0 flex-1 flex-col overflow-auto">
							{searchResults.map((match) => (
								<button
									type="button"
									key={`${match.sectionIndex}-${match.blockIndex}`}
									className="reader-row text-[13px]"
									onClick={() => jumpToSearchResult(match)}
								>
									<span className="block truncate text-[11px] text-[var(--muted-2)]">
										{sections?.[match.sectionIndex]?.title ??
											`Chapter ${match.sectionIndex + 1}`}
									</span>
									{match.snippet}
								</button>
							))}
							{searchResults.length >= SEARCH_RESULT_CAP ? (
								<p className="px-3 py-2 text-xs text-[var(--muted-2)]">
									Showing the first {SEARCH_RESULT_CAP} matches.
								</p>
							) : null}
						</div>
					)}
				</div>
			) : null}

			{activeSideTab === "bookmarks" ? (
				<div className="flex min-h-0 flex-1 flex-col">
					{!bookmarks ? (
						<p className="text-sm text-[var(--muted)]">Loading bookmarks...</p>
					) : bookmarks.length === 0 ? (
						<p className="text-sm text-[var(--muted)]">No bookmarks yet.</p>
					) : (
						<div className="reader-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
							{bookmarks.map((bookmark) => {
								const targetSectionId =
									sections?.[bookmark.sectionIndex]?._id ?? null;
								const sectionTitle =
									sections?.[bookmark.sectionIndex]?.title ??
									"Untitled chapter";
								const label = bookmark.label?.trim();
								const title = label || sectionTitle;
								const jumpToBookmark = () => {
									if (!targetSectionId) {
										return;
									}
									setIsTocOpen(false);
									// Legacy rows stored absolute pixels; treat >1 as "top of
									// the anchor block" instead of a bogus fraction.
									const fraction = bookmark.offset <= 1 ? bookmark.offset : 0;
									if (targetSectionId !== sectionId) {
										pendingChunkRef.current = {
											blockIndex: bookmark.blockIndex,
											fraction,
										};
										setActiveSectionId(targetSectionId);
										return;
									}
									const container = parentRef.current;
									if (container) {
										const top = visibleAnchorScrollTop(
											container,
											bookmark.blockIndex,
											fraction,
										);
										if (top !== null) {
											container.scrollTop = top;
											lastAppliedScrollTopRef.current = container.scrollTop;
											chromeScrollRef.current = {
												lastTop: container.scrollTop,
												downwardStartTop: container.scrollTop,
											};
										}
									}
								};
								return (
									// biome-ignore lint/a11y/useSemanticElements: the card nests a delete <button>; interactive controls can't nest inside a real button
									<div
										key={bookmark.clientKey}
										role="button"
										tabIndex={0}
										className="surface-soft relative shrink-0 cursor-pointer p-3 pr-10 text-xs transition hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
										onClick={jumpToBookmark}
										onKeyDown={(event) => {
											if (event.key === "Enter" || event.key === " ") {
												event.preventDefault();
												jumpToBookmark();
											}
										}}
									>
										<div className="text-[13px] text-[var(--ink)]">{title}</div>
										{label ? (
											<div className="mt-1 text-xs text-[var(--muted)]">
												{sectionTitle}
											</div>
										) : null}
										<div className="mt-1 text-[11px] text-[var(--muted-2)]">
											{`Chapter ${bookmark.sectionIndex + 1}`}
										</div>
										<button
											type="button"
											className="absolute bottom-3 right-3 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-[var(--muted-2)] transition hover:border-rose-500/40 hover:text-rose-300"
											onClick={(event) => {
												event.stopPropagation();
												void deleteBookmark(bookmark.clientKey);
											}}
										>
											<span className="sr-only">Remove bookmark</span>
											<Icon name="close" size={12} />
										</button>
									</div>
								);
							})}
						</div>
					)}
				</div>
			) : null}
		</>
	);

	const renderDrawer = () => (
		<>
			<div
				className={`reader-drawer-backdrop ${isTocOpen ? "is-open" : ""}`}
				// The backdrop is a pointer-only dismiss affordance, hidden from the
				// a11y tree; Escape closes the drawer for keyboard users.
				aria-hidden="true"
				onClick={() => setIsTocOpen(false)}
			/>
			<aside className={`reader-drawer ${isTocOpen ? "is-open" : ""}`}>
				<div className="border-b border-[color-mix(in_srgb,var(--outline)_60%,transparent)] px-4 pb-2.5 pt-3">
					<div className="flex items-start justify-between gap-2">
						<div className="min-w-0">
							<div className="truncate font-[family-name:var(--font-display)] text-base text-[var(--ink)]">
								{bookTitle || "Reading"}
							</div>
							{sections && activeIndex >= 0 ? (
								<div className="mt-0.5 text-xs text-[var(--muted-2)]">
									{`Chapter ${activeIndex + 1} of ${sections.length}`}
								</div>
							) : null}
						</div>
						<button
							type="button"
							className="icon-btn -mr-1 -mt-0.5 shrink-0"
							onClick={() => setIsTocOpen(false)}
						>
							<span className="sr-only">Close panel</span>
							<Icon name="close" />
						</button>
					</div>
					<div className="mt-2">{tabControls}</div>
				</div>
				<div className="flex min-h-0 flex-1 flex-col p-3">{sidebarPanels}</div>
			</aside>
		</>
	);

	return (
		<RequireAuth>
			<div className={`reader-shell ${themeClass} text-[var(--reader-ink)]`}>
				<div className={`reader-topbar ${chromeHidden ? "is-hidden" : ""}`}>
					<Link
						className="icon-btn tooltip shrink-0"
						data-tooltip="Library"
						data-tooltip-position="bottom"
						to="/library"
					>
						<span className="sr-only">Back to library</span>
						<Icon name="arrow-left" />
					</Link>
					<div className="reader-topbar-title">
						{activeSection?.title ?? "Reading"}
					</div>
					{sections && sections.length > 0 && activeIndex >= 0 ? (
						<div
							className="reader-top-progress shrink-0 text-xs text-[var(--muted-2)]"
							title={`Chapter ${activeIndex + 1} of ${sections.length}`}
						>
							{`${activeIndex + 1} / ${sections.length} · ${Math.round(
								bookProgress(
									activeIndex,
									effectiveProgress?.sectionIndex === activeIndex
										? effectiveProgress.sectionFraction
										: 0,
									sections.length,
								) * 100,
							)}%`}
						</div>
					) : null}
					<div className="ml-auto flex shrink-0 items-center gap-1">
						<button
							type="button"
							className="icon-btn tooltip"
							data-tooltip="Bookmark"
							data-tooltip-position="bottom"
							onClick={handleCreateBookmark}
							disabled={!sectionId}
						>
							<span className="sr-only">Bookmark</span>
							<Icon name="bookmark" />
						</button>
						<button
							type="button"
							className="icon-btn tooltip reader-top-mobile-secondary"
							data-tooltip="Previous chapter"
							data-tooltip-position="bottom"
							onClick={goPrev}
							disabled={!sections || activeIndex <= 0}
						>
							<span className="sr-only">Previous chapter</span>
							<Icon name="chevron-left" />
						</button>
						<button
							type="button"
							className="icon-btn tooltip reader-top-mobile-secondary"
							data-tooltip="Next chapter"
							data-tooltip-position="bottom"
							onClick={goNext}
							disabled={
								!sections ||
								activeIndex < 0 ||
								activeIndex >= sections.length - 1
							}
						>
							<span className="sr-only">Next chapter</span>
							<Icon name="chevron-right" />
						</button>
						<button
							type="button"
							className={`icon-btn tooltip ${isTocOpen && activeSideTab === "toc" ? "is-active" : ""}`}
							data-tooltip="Chapters"
							data-tooltip-position="bottom"
							onClick={() => {
								if (isTocOpen && activeSideTab === "toc") {
									setIsTocOpen(false);
									return;
								}
								setActiveSideTab("toc");
								setIsTocOpen(true);
							}}
						>
							<span className="sr-only">Chapters</span>
							<Icon name="menu" />
						</button>
						<button
							type="button"
							className="icon-btn tooltip reader-top-mobile-secondary"
							data-tooltip="Reader preferences"
							data-tooltip-position="bottom"
							onClick={() => setIsPrefsOpen(true)}
						>
							<span className="sr-only">Reader preferences</span>
							<Icon name="settings" />
						</button>
					</div>
				</div>

				<div
					className="reader-content relative"
					style={{ "--reader-content-w": `${contentWidth}px` } as CSSProperties}
				>
					<button
						// Not `disabled`: browsers suppress wheel events on disabled
						// controls, which would deaden the margin for scrolling on the
						// first/last chapter. Inert state is styled + guarded instead.
						type="button"
						className={`reader-edge-nav is-left ${
							!sections || activeIndex <= 0 ? "is-inert" : ""
						}`}
						aria-label="Previous chapter"
						aria-disabled={!sections || activeIndex <= 0}
						onClick={() => {
							if (sections && activeIndex > 0) {
								goPrev();
							}
						}}
						// Margins overlay the scroll container — hand wheel motion
						// through so scrolling doesn't go dead at the screen edges.
						// deltaMode: Firefox reports line-based deltas (~3 per notch).
						onWheel={(event) =>
							parentRef.current?.scrollBy({
								top:
									event.deltaY *
									(event.deltaMode === 1
										? 32
										: event.deltaMode === 2
											? parentRef.current.clientHeight
											: 1),
							})
						}
					>
						<span className="reader-edge-chevron" aria-hidden="true">
							<Icon name="chevron-left" size={18} />
						</span>
					</button>
					<button
						type="button"
						className={`reader-edge-nav is-right ${
							!sections || activeIndex < 0 || activeIndex >= sections.length - 1
								? "is-inert"
								: ""
						}`}
						aria-label="Next chapter"
						aria-disabled={
							!sections || activeIndex < 0 || activeIndex >= sections.length - 1
						}
						onClick={() => {
							if (
								sections &&
								activeIndex >= 0 &&
								activeIndex < sections.length - 1
							) {
								goNext();
							}
						}}
						onWheel={(event) =>
							parentRef.current?.scrollBy({
								top:
									event.deltaY *
									(event.deltaMode === 1
										? 32
										: event.deltaMode === 2
											? parentRef.current.clientHeight
											: 1),
							})
						}
					>
						<span className="reader-edge-chevron" aria-hidden="true">
							<Icon name="chevron-right" size={18} />
						</span>
					</button>
					{showLoadingOverlay ? (
						<div className="pointer-events-none absolute right-6 top-4 z-10 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--surface-3)_90%,transparent)] px-3 py-1 text-xs text-[var(--reader-muted)]">
							Loading chapter…
						</div>
					) : null}
					{/* Wait for the merged progress view: local resolves instantly
              (offline included); online adds a brief wait for the remote
              copy so we restore to the right chapter. */}
					{effectiveProgress === undefined && sectionId ? (
						<div className="p-6 text-sm text-[var(--reader-muted)]">
							Restoring your place…
						</div>
					) : (
						// biome-ignore lint/a11y/noStaticElementInteractions: center-tap is a touch-only convenience for summoning navigation; keyboard/AT users have the fully-operable topbar controls
						// biome-ignore lint/a11y/useKeyWithClickEvents: see above — pointer-only enhancement, not the sole path to navigation
						<div
							ref={parentRef}
							onPointerDown={handleContentPointerDown}
							onClick={handleContentClick}
							className="reader-scroll reader-main-scroll h-full overflow-auto text-left"
							style={{
								fontSize: `${fontSize}px`,
								lineHeight: lineHeight,
								fontFamily:
									fontFamily === "serif"
										? "var(--font-display)"
										: "var(--font-body)",
							}}
						>
							<div
								className="mx-auto"
								style={{ maxWidth: `${contentWidth}px` }}
							>
								{!blocks || blocks.length === 0 ? (
									<h1 className="mb-6 text-2xl text-[var(--reader-ink)]">
										{/* While seeding there's no section yet — the book's own
										    title beats a placeholder. */}
										{activeSection?.title ?? (bookTitle || "Untitled chapter")}
									</h1>
								) : null}
								{(blocks && blocks.length > 0 ? false : chunks.length === 0) ? (
									isSeeding ? (
										// First open on this device: streamed download with real
										// progress (Content-Length), then a brief parse.
										<div role="status" aria-label="Downloading book">
											<ParagraphSkeleton />
											<div className="mt-8 flex flex-col gap-2">
												<div className="h-0.5 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--reader-muted)_20%,transparent)]">
													<div
														className={`h-full rounded-full bg-[var(--accent)] transition-[width] duration-200 ${
															seedProgress?.total ? "" : "w-1/3 animate-pulse"
														}`}
														style={
															seedProgress?.total
																? {
																		width: `${Math.min(100, Math.round((seedProgress.loaded / seedProgress.total) * 100))}%`,
																	}
																: undefined
														}
													/>
												</div>
												<p className="text-xs text-[var(--reader-muted)]">
													{seedProgress?.total
														? seedProgress.loaded >= seedProgress.total
															? "Preparing book…"
															: `Downloading book — ${Math.min(100, Math.round((seedProgress.loaded / seedProgress.total) * 100))}%`
														: "Downloading book…"}
												</p>
											</div>
										</div>
									) : seedError || !sectionId ? (
										<p className="text-sm text-[var(--reader-muted)]">
											{seedError
												? `Could not download this book: ${seedError}`
												: "Select a chapter to begin reading."}
										</p>
									) : (
										<div role="status" aria-label="Loading chapter">
											<ParagraphSkeleton />
										</div>
									)
								) : blocks && blocks.length > 0 ? (
									<ReaderBlocks
										blocks={blocks}
										imageUrls={imageUrls}
										activeSectionTitle={activeSection?.title}
										activeSectionHref={activeSection?.href}
										sectionLinkIndex={sectionLinkIndex}
										onNavigateToSection={goToSectionStart}
									/>
								) : (
									chunks.map((chunk, index) => (
										<div
											key={chunk.id}
											data-chunk-index={index}
											className="py-3 whitespace-pre-wrap text-[var(--reader-ink)]"
											style={{ lineHeight }}
										>
											{chunk.content}
										</div>
									))
								)}
								{sections &&
								activeIndex >= 0 &&
								((blocks && blocks.length > 0) || chunks.length > 0) ? (
									<nav
										className="reader-chapter-end"
										aria-label="Chapter navigation"
									>
										{activeIndex > 0 ? (
											<button
												type="button"
												className="reader-turn is-prev"
												onClick={goPrev}
											>
												<span className="reader-turn-label">Previous</span>
												<span className="reader-turn-title">
													{sections[activeIndex - 1].title}
												</span>
											</button>
										) : (
											<span className="reader-turn-spacer" aria-hidden="true" />
										)}
										{activeIndex < sections.length - 1 ? (
											<button
												type="button"
												className="reader-turn is-next"
												onClick={goNext}
											>
												<span className="reader-turn-label">Next</span>
												<span className="reader-turn-title">
													{sections[activeIndex + 1].title}
												</span>
											</button>
										) : (
											<Link className="reader-turn is-next" to="/library">
												<span className="reader-turn-label">The end</span>
												<span className="reader-turn-title">
													Back to library
												</span>
											</Link>
										)}
									</nav>
								) : null}
							</div>
						</div>
					)}
				</div>

				{/* Thumb-zone control bar (phone only, CSS-gated): persistent chapter
				    navigation around progress, plus appearance settings. Contents lives
				    beside the chapter title in the top bar. */}
				{sections && sections.length > 0 && activeIndex >= 0 ? (
					<div className={`reader-botbar ${chromeHidden ? "is-hidden" : ""}`}>
						<button
							type="button"
							className="reader-botbar-nav"
							aria-label="Previous chapter"
							title="Previous chapter"
							onClick={goPrev}
							disabled={activeIndex <= 0}
						>
							<Icon name="chevron-left" />
						</button>
						<div className="reader-botbar-center">
							<span className="sr-only">Reading progress: </span>
							<span>
								{`${activeIndex + 1} / ${sections.length} · ${Math.round(
									bookProgress(
										activeIndex,
										effectiveProgress?.sectionIndex === activeIndex
											? effectiveProgress.sectionFraction
											: 0,
										sections.length,
									) * 100,
								)}%`}
							</span>
						</div>
						<button
							type="button"
							className="reader-botbar-nav"
							aria-label="Next chapter"
							title="Next chapter"
							onClick={goNext}
							disabled={activeIndex >= sections.length - 1}
						>
							<Icon name="chevron-right" />
						</button>
						<button
							type="button"
							className="reader-botbar-settings"
							aria-label="Reader preferences"
							onClick={() => setIsPrefsOpen(true)}
						>
							<Icon name="settings" />
						</button>
					</div>
				) : null}

				{renderDrawer()}
			</div>

			<ReaderPreferencesModal
				isOpen={isPrefsOpen}
				onClose={() => setIsPrefsOpen(false)}
				fontSize={fontSize}
				setFontScale={setFontScale}
				lineHeight={lineHeight}
				setLineHeight={setLineHeight}
				contentWidth={contentWidth}
				setContentWidth={setContentWidth}
				theme={theme}
				setTheme={setTheme}
				fontFamily={fontFamily}
				setFontFamily={setFontFamily}
			/>
		</RequireAuth>
	);
}
