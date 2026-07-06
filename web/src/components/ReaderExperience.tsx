import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, JSX } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Link, useNavigate } from '@tanstack/react-router'
import { useConvex, useConvexAuth, useQuery } from 'convex/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { api } from '../../convex/_generated/api'
import { RequireAuth } from './RequireAuth'
import { useUserSettings } from '../hooks/useUserSettings'
import { useProgressSync } from '../hooks/useProgressSync'
import { useBookmarkSync } from '../hooks/useBookmarkSync'
import { ReaderPreferencesModal } from './ReaderPreferencesModal'
import { seedBookFromR2 } from '../lib/seedBook'
import {
  blockToText,
  type BlockPayload,
  type InlinePayload,
} from '../lib/blockText'
import { anchorScrollTop, findAnchor } from '../lib/readerAnchors'
import { bookProgress } from '../lib/progress'
import { scanSections } from '../lib/searchScan'
import {
  PARSER_VERSION,
  db,
  deleteLocalBook,
  getLocalBlocks,
  localSectionKey,
} from '../lib/db'

type ReaderSection = {
  _id: string
  title: string
  orderIndex: number
  href?: string
  anchor?: string
}

type ReaderChunk = {
  id: string
  content: string
}

type ReaderExperienceProps = {
  bookId: string
}

export function ReaderExperience({ bookId }: ReaderExperienceProps) {
  const { isAuthenticated } = useConvexAuth()
  const canQuery = isAuthenticated
  const navigate = useNavigate()

  // If the book was deleted (possibly from another device) while open here,
  // purge the local copy and return to the library instead of erroring.
  const remoteBook = useQuery(
    api.books.getBook,
    canQuery ? { bookId: bookId as never } : 'skip',
  )
  useEffect(() => {
    if (!canQuery || remoteBook !== null) {
      return
    }
    void (async () => {
      try {
        await deleteLocalBook(bookId)
      } catch {
        // Purge retried by the library reconcile.
      }
      void navigate({ to: '/library' })
    })()
  }, [canQuery, remoteBook, bookId, navigate])
  // Local-first: IndexedDB is the only content source. Books not on this
  // device are seeded from R2 (download EPUB → re-parse → IndexedDB) below.
  const localSectionRows = useLiveQuery(
    () => db.sections.where('bookId').equals(bookId).sortBy('orderIndex'),
    [bookId],
  )
  // Book title for the panel header (local row works offline).
  const localBookRow = useLiveQuery(() => db.books.get(bookId), [bookId])
  const bookTitle = localBookRow?.title ?? remoteBook?.title ?? ''
  const sections: ReaderSection[] | undefined = useMemo(() => {
    if (!localSectionRows) {
      return undefined
    }
    return localSectionRows.map((row) => ({
      _id: localSectionKey(bookId, row.orderIndex),
      title: row.title,
      orderIndex: row.orderIndex,
      href: row.href,
      anchor: row.anchor,
    }))
  }, [localSectionRows, bookId])

  // Device seeding (ROADMAP Phase 5): if this device has no local content —
  // or its blocks were parsed by an older @abfcode/spine — download the raw
  // EPUB from R2 and re-parse it locally.
  const convex = useConvex()
  const [isSeeding, setIsSeeding] = useState(false)
  const [seedError, setSeedError] = useState<string | null>(null)
  const seedingRef = useRef(false)
  useEffect(() => {
    if (!canQuery || !remoteBook || seedingRef.current) {
      return
    }
    if (localSectionRows === undefined) {
      return
    }
    if (!remoteBook.epubKey) {
      return
    }
    void (async () => {
      const localBook = await db.books.get(bookId)
      const hasContent = localSectionRows.length > 0
      const stale =
        hasContent &&
        !!localBook?.parserVersion &&
        localBook.parserVersion !== PARSER_VERSION
      if (hasContent && !stale) {
        return
      }
      seedingRef.current = true
      setIsSeeding(true)
      setSeedError(null)
      try {
        await seedBookFromR2(convex, bookId, { replace: stale })
      } catch (err) {
        setSeedError(
          err instanceof Error ? err.message : 'Failed to download book',
        )
      } finally {
        seedingRef.current = false
        setIsSeeding(false)
      }
    })()
  }, [canQuery, remoteBook, localSectionRows, bookId, convex])

  // Local-first progress (ROADMAP Phase 4): every edit lands in IndexedDB
  // first and syncs to Convex via LWW on section indexes.
  const { effectiveProgress, saveProgress } = useProgressSync({
    bookId,
    canQuery,
  })

  // Local-first bookmarks: create/delete work offline; tombstones propagate
  // deletes across devices.
  const { bookmarks, createBookmark, deleteBookmark } = useBookmarkSync({
    bookId,
    canQuery,
  })
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [chunks, setChunks] = useState<ReaderChunk[]>([])
  const [blocks, setBlocks] = useState<BlockPayload[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isTocOpen, setIsTocOpen] = useState(false)
  const [activeSideTab, setActiveSideTab] = useState<'toc' | 'search' | 'bookmarks'>('toc')
  const [isPrefsOpen, setIsPrefsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  // Which section the currently rendered blocks belong to. Restore/jump
  // effects must not touch the DOM until it matches sectionId — otherwise a
  // cross-section jump anchors against the previous chapter's content.
  const [loadedSectionId, setLoadedSectionId] = useState<string | null>(null)
  const parentRef = useRef<HTMLDivElement | null>(null)
  const activeSectionRef = useRef<string | null>(null)
  const lastProgressAtRef = useRef<number>(0)
  const trailingEmitRef = useRef<number | null>(null)
  // Anchor to apply after a cross-section jump (search result / bookmark).
  const pendingChunkRef = useRef<{
    blockIndex: number
    fraction: number
  } | null>(null)
  const loadingSectionRef = useRef<string | null>(null)
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false)
  const restoredFromUserBookRef = useRef(false)
  // Where the initial restore put the view, and when we mounted — used to
  // allow a one-time cross-device hand-off correction (never a later yank).
  const initialRestoreTargetRef = useRef<string | null>(null)
  const mountedAtRef = useRef(Date.now())
  const initialProgressRef = useRef(false)
  const scrollRestoredRef = useRef<string | null>(null)
  // Restore is applied synchronously, then silently re-anchored while fonts
  // and images settle — unless the user has scrolled in the meantime, or a
  // newer restore has bumped the token (invalidates stale async closures).
  const lastAppliedScrollTopRef = useRef(0)
  const userScrolledSinceRestoreRef = useRef(false)
  const anchorTokenRef = useRef(0)
  const tocListRef = useRef<HTMLDivElement | null>(null)
  const fontsReadyRef = useRef<Promise<void> | null>(null)
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
  } = useUserSettings({ pauseSync: isPrefsOpen })

  // Note: the chapters panel is a transient popover — it always starts
  // closed. (The old docked sidebar persisted open-state to localStorage and
  // defaulted open on desktop; that machinery is gone.)

  const sectionId = activeSectionId ?? null

  useEffect(() => {
    activeSectionRef.current = sectionId
  }, [sectionId])

  const activeSection = useMemo(() => {
    if (!sections || !sectionId) {
      return null
    }
    return sections.find((section) => section._id === sectionId) ?? null
  }, [sections, sectionId])

  const fontSize = 16 + fontScale * 2
  const themeClass =
    theme === 'paper'
      ? 'reader-theme-paper'
      : theme === 'sepia'
        ? 'reader-theme-sepia'
        : 'reader-theme-night'

  const activeIndex = useMemo(() => {
    if (!sections || !sectionId) {
      return -1
    }
    return sections.findIndex((section) => section._id === sectionId)
  }, [sections, sectionId])

  const sectionLinkIndex = useMemo(() => {
    const map = new Map<string, string>()
    if (!sections) {
      return map
    }
    for (const section of sections) {
      const base = normalizeHref(section.href)
      const anchor = normalizeAnchor(section.anchor)
      if (base && anchor) {
        map.set(`${base}#${anchor}`, section._id)
      }
      if (base) {
        map.set(base, section._id)
      }
      if (anchor) {
        map.set(`#${anchor}`, section._id)
      }
    }
    return map
  }, [sections])

  const imageHrefs = useMemo(() => {
    if (!blocks || blocks.length === 0) {
      return []
    }
    const set = new Set<string>()
    const collectInlines = (inlines?: InlinePayload[]) => {
      if (!inlines) {
        return
      }
      for (const inline of inlines) {
        if (inline.kind === 'image' && inline.src) {
          set.add(inline.src)
        }
      }
    }
    for (const block of blocks) {
      collectInlines(block.inlines)
      if (block.figure) {
        collectInlines(block.figure.images)
        collectInlines(block.figure.caption)
      }
      if (block.table) {
        for (const row of block.table.rows) {
          for (const cell of row.cells) {
            collectInlines(cell.inlines)
          }
        }
      }
    }
    return Array.from(set)
  }, [blocks])

  // Images: object URLs from IndexedDB blobs (stored at import/seed time).
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    const created: string[] = []
    if (imageHrefs.length === 0) {
      setImageUrls({})
      return
    }
    void (async () => {
      const local: Record<string, string> = {}
      try {
        const rows = await db.images.bulkGet(
          imageHrefs.map((href) => [bookId, href] as [string, string]),
        )
        rows.forEach((row, i) => {
          if (row) {
            const url = URL.createObjectURL(row.blob)
            local[imageHrefs[i]] = url
            created.push(url)
          }
        })
      } catch {
        // IndexedDB unavailable — images simply don't render.
      }
      if (cancelled) {
        created.forEach((url) => URL.revokeObjectURL(url))
        return
      }
      setImageUrls(local)
    })()
    return () => {
      cancelled = true
      created.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [imageHrefs, bookId])

  const goToSection = (index: number) => {
    if (!sections || index < 0 || index >= sections.length) {
      return
    }
    setActiveSectionId(sections[index]._id)
  }

  const goNext = () => {
    if (activeIndex < 0) {
      return
    }
    goToSection(activeIndex + 1)
  }

  const goPrev = () => {
    if (activeIndex < 0) {
      return
    }
    goToSection(activeIndex - 1)
  }

  useEffect(() => {
    if (!sections || sections.length === 0) {
      return
    }
    // Wait for the merged progress view (local is instant; online adds a
    // brief wait for the remote copy) so we restore to the right chapter.
    if (effectiveProgress === undefined) {
      return
    }
    if (effectiveProgress && !restoredFromUserBookRef.current) {
      const match = sections[effectiveProgress.sectionIndex]
      if (match && match._id !== activeSectionId) {
        setActiveSectionId(match._id)
        initialRestoreTargetRef.current = match._id
        restoredFromUserBookRef.current = true
        return
      }
      restoredFromUserBookRef.current = true
    }
    if (!activeSectionId) {
      initialRestoreTargetRef.current = sections[0]._id
      setActiveSectionId(sections[0]._id)
    }
  }, [sections, activeSectionId, effectiveProgress])

  // Cross-device hand-off: if a newer remote position arrives moments after
  // opening the book, and the user has not navigated away from where the
  // initial restore put them, correct the view once. An engaged reader
  // (navigated, or local edits pending) is never yanked.
  useEffect(() => {
    if (!sections || sections.length === 0 || !effectiveProgress) {
      return
    }
    if (!restoredFromUserBookRef.current) {
      return
    }
    if (effectiveProgress.source !== 'remote') {
      return
    }
    if (Date.now() - mountedAtRef.current > 4000) {
      return
    }
    if (
      !activeSectionId ||
      activeSectionId !== initialRestoreTargetRef.current
    ) {
      return
    }
    const target = sections[effectiveProgress.sectionIndex]
    if (!target || target._id === activeSectionId) {
      return
    }
    initialRestoreTargetRef.current = target._id
    setActiveSectionId(target._id)
  }, [sections, effectiveProgress, activeSectionId])

  const loadSection = async (targetId: string | null) => {
    if (!targetId) {
      return
    }
    loadingSectionRef.current = targetId
    setIsLoading(true)

    // Blocks come from IndexedDB only — content is always local (imported
    // here or seeded from R2); no network on the read path.
    const meta = sections?.find((section) => section._id === targetId)
    if (meta) {
      const local = await getLocalBlocks(bookId, meta.orderIndex)
      if (local && activeSectionRef.current === targetId) {
        setBlocks(local as BlockPayload[])
        setChunks([])
        setLoadedSectionId(targetId)
      }
    }
    if (loadingSectionRef.current === targetId) {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadSection(sectionId)
  }, [sectionId])

  useEffect(() => {
    let timeout: number | undefined
    if (isLoading) {
      timeout = window.setTimeout(() => {
        setShowLoadingOverlay(true)
      }, 250)
    } else {
      setShowLoadingOverlay(false)
    }
    return () => {
      if (timeout) {
        window.clearTimeout(timeout)
      }
    }
  }, [isLoading])

  const emitProgress = () => {
    if (!sectionId || !parentRef.current || activeIndex < 0) {
      return
    }
    // Do not overwrite saved progress before the initial restore has run.
    if (effectiveProgress === undefined) {
      return
    }
    if (effectiveProgress && !restoredFromUserBookRef.current) {
      return
    }
    const anchor = findAnchor(parentRef.current)
    // Local write is instant and offline-capable; the sync hook pushes to
    // Convex (LWW) whenever a connection and the section's Convex id exist.
    void saveProgress({
      sectionIndex: activeIndex,
      blockIndex: anchor.blockIndex,
      blockOffset: anchor.fraction,
      sectionFraction: anchor.sectionFraction,
    })
  }

  const waitForFonts = () => {
    if (typeof document === 'undefined') {
      return Promise.resolve()
    }
    if (!fontsReadyRef.current) {
      const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
      fontsReadyRef.current = fonts?.ready
        ? fonts.ready.then(() => undefined).catch(() => undefined)
        : Promise.resolve()
    }
    return fontsReadyRef.current
  }

  useEffect(() => {
    const container = parentRef.current
    if (!container) {
      return
    }
    const handleScroll = () => {
      // Programmatic restores land exactly on lastAppliedScrollTop; anything
      // else is the user, which cancels pending silent re-anchors.
      if (Math.abs(container.scrollTop - lastAppliedScrollTopRef.current) > 4) {
        userScrolledSinceRestoreRef.current = true
      }
      // Trailing emit: without it the throttle can leave the saved anchor
      // several screens behind after a fast scroll, and anything that
      // re-applies saved progress (font-size change) yanks the view back.
      if (trailingEmitRef.current !== null) {
        window.clearTimeout(trailingEmitRef.current)
      }
      trailingEmitRef.current = window.setTimeout(() => {
        trailingEmitRef.current = null
        lastProgressAtRef.current = Date.now()
        emitProgress()
      }, 300)
      const now = Date.now()
      if (now - lastProgressAtRef.current < 800) {
        return
      }
      lastProgressAtRef.current = now
      emitProgress()
    }
    container.addEventListener('scroll', handleScroll)
    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (trailingEmitRef.current !== null) {
        window.clearTimeout(trailingEmitRef.current)
        trailingEmitRef.current = null
      }
    }
  }, [sectionId])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        emitProgress()
      }
    }
    window.addEventListener('pagehide', emitProgress)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('pagehide', emitProgress)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [sectionId, effectiveProgress])

  // Layout inputs (font size/family, line height, width) reflow the text and
  // strand the scroll position — including on load, when synced settings
  // arrive a beat after the initial restore. Re-apply the saved anchor; the
  // fraction makes it exact in the new layout.
  useLayoutEffect(() => {
    const container = parentRef.current
    if (!container || !sectionId || !effectiveProgress) {
      return
    }
    // Only after the initial restore has anchored this section.
    if (scrollRestoredRef.current !== sectionId) {
      return
    }
    if (effectiveProgress.sectionIndex !== activeIndex) {
      return
    }
    const top = anchorScrollTop(
      container,
      effectiveProgress.blockIndex,
      effectiveProgress.blockOffset,
    )
    if (top === null) {
      return
    }
    container.scrollTop = top
    lastAppliedScrollTopRef.current = container.scrollTop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontSize, lineHeight, contentWidth, fontFamily])

  // Persist position on arrival at a section — a chapter switch with no
  // scrolling would otherwise never save (progress only emitted on scroll
  // and tab-hide before this). Wait for the section's own content: emitting
  // against the previous chapter's DOM would save a bogus anchor.
  useEffect(() => {
    if (loadedSectionId !== sectionId) {
      return
    }
    if (!blocks || blocks.length === 0) {
      return
    }
    emitProgress()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedSectionId, sectionId, blocks])

  const tocVirtualizer = useVirtualizer({
    count: sections?.length ?? 0,
    getScrollElement: () => tocListRef.current,
    estimateSize: () => 64,
    overscan: 10,
  })

  useEffect(() => {
    if (!isTocOpen || activeSideTab !== 'toc' || activeIndex < 0) {
      return
    }
    const id = window.requestAnimationFrame(() => {
      tocVirtualizer.scrollToIndex(activeIndex, { align: 'center' })
    })
    return () => window.cancelAnimationFrame(id)
  }, [isTocOpen, activeSideTab, activeIndex, tocVirtualizer])

  useLayoutEffect(() => {
    const container = parentRef.current
    if (!container || !sectionId) {
      return
    }
    // Never anchor against another section's DOM: after a section switch the
    // old blocks stay mounted until loadSection finishes, and consuming a
    // pending jump (or restoring) against them lands at a bogus position.
    if (loadedSectionId !== sectionId) {
      return
    }
    const hasContent = (blocks && blocks.length > 0) || chunks.length > 0
    if (!hasContent) {
      return
    }
    const applyScroll = (top: number) => {
      container.scrollTop = top
      lastAppliedScrollTopRef.current = container.scrollTop
    }
    if (pendingChunkRef.current !== null) {
      const pending = pendingChunkRef.current
      pendingChunkRef.current = null
      anchorTokenRef.current++
      applyScroll(
        anchorScrollTop(container, pending.blockIndex, pending.fraction) ?? 0,
      )
      scrollRestoredRef.current = sectionId
      return
    }
    if (
      effectiveProgress &&
      activeIndex >= 0 &&
      effectiveProgress.sectionIndex === activeIndex
    ) {
      if (scrollRestoredRef.current === sectionId) {
        return
      }
      const targetIndex = effectiveProgress.blockIndex
      const targetFraction = effectiveProgress.blockOffset
      const applyAnchor = () => {
        const top = anchorScrollTop(container, targetIndex, targetFraction)
        if (top === null) {
          return false
        }
        applyScroll(top)
        return true
      }
      userScrolledSinceRestoreRef.current = false
      if (!applyAnchor()) {
        applyScroll(0)
      }
      scrollRestoredRef.current = sectionId
      // Content stays visible; if fonts or images settle and shift layout,
      // silently re-apply the anchor — unless the user has scrolled away or
      // a newer restore has run (token invalidates stale async closures,
      // e.g. navigating A→B→A before A's fonts/images resolved).
      const token = ++anchorTokenRef.current
      const reanchor = () => {
        if (
          anchorTokenRef.current === token &&
          !userScrolledSinceRestoreRef.current
        ) {
          applyAnchor()
        }
      }
      void waitForFonts().then(reanchor)
      const onAssetLoad = (event: Event) => {
        if ((event.target as HTMLElement | null)?.tagName === 'IMG') {
          reanchor()
        }
      }
      container.addEventListener('load', onAssetLoad, true)
      window.setTimeout(() => {
        container.removeEventListener('load', onAssetLoad, true)
      }, 3000)
      return
    }
    if (effectiveProgress === null && !initialProgressRef.current) {
      initialProgressRef.current = true
      void saveProgress({
        sectionIndex: activeIndex >= 0 ? activeIndex : 0,
        blockIndex: 0,
        blockOffset: 0,
      })
    }
    anchorTokenRef.current++
    applyScroll(0)
    scrollRestoredRef.current = null
  }, [sectionId, loadedSectionId, chunks.length, blocks?.length, effectiveProgress, activeIndex])

  // ── Whole-book search ──────────────────────────────────────────────────────
  // Scans every section's text from IndexedDB. Built to stay responsive on
  // 2,000-chapter novels: the text cache is built once per book (blocks →
  // plain strings, chunked with event-loop yields), scans are debounced,
  // cancellable, capped, and also yield between chunks.
  const SEARCH_RESULT_CAP = 50
  const [searchResults, setSearchResults] = useState<
    Array<{ sectionIndex: number; blockIndex: number; snippet: string }>
  >([])
  const [isSearching, setIsSearching] = useState(false)
  // Keyed by the live-query rows' identity: a re-parse or seeding batch
  // yields a new array, invalidating the cache even when the section count
  // is unchanged. Text is cached pre-lowercased so scans are pure indexOf.
  const bookTextCacheRef = useRef<{
    rows: unknown
    perSection: { texts: string[]; lower: string[] }[]
  } | null>(null)
  const searchTokenRef = useRef(0)

  // Drop the previous book's cache on navigation so ~MBs of strings don't
  // linger while reading a different book.
  useEffect(() => {
    bookTextCacheRef.current = null
  }, [bookId])

  const ensureBookText = async (token: number) => {
    const rows = localSectionRows
    if (!rows || rows.length === 0) {
      return null
    }
    if (bookTextCacheRef.current?.rows === rows) {
      return bookTextCacheRef.current.perSection
    }
    // The rows (with blocks) are already in memory via the live query — no
    // second IndexedDB read.
    const perSection: { texts: string[]; lower: string[] }[] = []
    for (let i = 0; i < rows.length; i++) {
      const texts = (rows[i].blocks ?? []).map((block) =>
        blockToText(block as BlockPayload),
      )
      perSection[i] = { texts, lower: texts.map((t) => t.toLowerCase()) }
      if (i % 100 === 99) {
        await new Promise((resolve) => setTimeout(resolve))
        if (searchTokenRef.current !== token) {
          return null
        }
      }
    }
    bookTextCacheRef.current = { rows, perSection }
    return perSection
  }

  useEffect(() => {
    const query = searchQuery.trim().toLowerCase()
    if (query.length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return
    }
    const token = ++searchTokenRef.current
    const timer = window.setTimeout(() => {
      void (async () => {
        setIsSearching(true)
        try {
          const perSection = await ensureBookText(token)
          if (!perSection || searchTokenRef.current !== token) {
            return
          }
          const out: Array<{
            sectionIndex: number
            blockIndex: number
            snippet: string
          }> = []
          // Scan in section windows, yielding to the event loop between
          // them so huge books never block the main thread.
          const WINDOW = 200
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
            )
            await new Promise((resolve) => setTimeout(resolve))
            if (searchTokenRef.current !== token) {
              return
            }
          }
          if (searchTokenRef.current === token) {
            setSearchResults(out)
          }
        } finally {
          if (searchTokenRef.current === token) {
            setIsSearching(false)
          }
        }
      })()
    }, 250)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, bookId, localSectionRows])

  const jumpToSearchResult = (result: {
    sectionIndex: number
    blockIndex: number
  }) => {
    const targetId = sections?.[result.sectionIndex]?._id ?? null
    if (!targetId) {
      return
    }
    setIsTocOpen(false)
    if (targetId === sectionId) {
      scrollToChunk(result.blockIndex)
      return
    }
    pendingChunkRef.current = { blockIndex: result.blockIndex, fraction: 0 }
    setActiveSectionId(targetId)
  }

  const scrollToChunk = (index: number) => {
    const container = parentRef.current
    if (!container) {
      return
    }
    const target = container.querySelector(
      `[data-chunk-index="${index}"]`,
    ) as HTMLElement | null
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const renderInlines = (inlines?: InlinePayload[], keyPrefix = 'inline') => {
    if (!inlines || inlines.length === 0) {
      return null
    }
    return inlines.map((inline, index) => {
      const key = `${keyPrefix}-${index}`
      switch (inline.kind) {
        case 'emphasis':
          return <em key={key}>{inline.text}</em>
        case 'strong':
          return <strong key={key}>{inline.text}</strong>
        case 'link': {
          const href = inline.href ?? '#'
          const external =
            href.startsWith('http://') ||
            href.startsWith('https://') ||
            href.startsWith('mailto:') ||
            href.startsWith('tel:') ||
            href.startsWith('data:')
          const targetSectionId = !external
            ? resolveInternalSectionId(href, activeSection?.href, sectionLinkIndex)
            : null
          return (
            <a
              key={key}
              href={href}
              className="reader-link"
              target={external ? '_blank' : undefined}
              rel={external ? 'noreferrer' : undefined}
              onClick={(event) => {
                if (!external) {
                  event.preventDefault()
                  if (targetSectionId) {
                    setActiveSectionId(targetSectionId)
                  }
                }
              }}
            >
              {inline.text}
            </a>
          )
        }
        case 'image': {
          const src = inline.src ? imageUrls?.[inline.src] : undefined
          if (!src) {
            return null
          }
          const width = inline.width && inline.width > 0 ? inline.width : undefined
          const height = inline.height && inline.height > 0 ? inline.height : undefined
          return (
            <img
              key={key}
              src={src}
              alt={inline.alt ?? ''}
              width={width}
              height={height}
              style={
                width && height
                  ? { aspectRatio: `${width}/${height}` }
                  : undefined
              }
              className="reader-image"
              loading="lazy"
            />
          )
        }
        case 'code':
          return <code key={key}>{inline.text}</code>
        default:
          return <span key={key}>{inline.text}</span>
      }
    })
  }

  const renderBlocks = (contentBlocks: BlockPayload[]) => {
    const nodes: JSX.Element[] = []
    const normalizedTitle = activeSection?.title
      ? activeSection.title.trim().toLowerCase()
      : null
    const shouldSkipFirstHeading =
      normalizedTitle &&
      contentBlocks.length > 0 &&
      contentBlocks[0].kind === 'heading' &&
      blockToText(contentBlocks[0]).trim().toLowerCase() === normalizedTitle
    for (let i = 0; i < contentBlocks.length; i += 1) {
      if (i === 0 && shouldSkipFirstHeading) {
        continue
      }
      const block = contentBlocks[i]
      if (block.kind === 'list_item') {
        const ordered = Boolean(block.ordered)
        const items: BlockPayload[] = [block]
        let j = i + 1
        while (
          j < contentBlocks.length &&
          contentBlocks[j].kind === 'list_item' &&
          Boolean(contentBlocks[j].ordered) === ordered
        ) {
          items.push(contentBlocks[j])
          j += 1
        }
        i = j - 1
        const ListTag = ordered ? 'ol' : 'ul'
        nodes.push(
          <ListTag key={`list-${i}`} className="reader-list">
            {items.map((item, itemIndex) => (
              <li
                key={`list-item-${i}-${itemIndex}`}
                data-chunk-index={i + itemIndex}
              >
                {renderInlines(item.inlines, `li-${i}-${itemIndex}`)}
              </li>
            ))}
          </ListTag>,
        )
        continue
      }
      if (block.kind === 'heading') {
        const level = Math.min(6, Math.max(1, block.level ?? 2))
        const Tag = `h${level}` as keyof JSX.IntrinsicElements
        nodes.push(
          <Tag key={`heading-${i}`} data-chunk-index={i} className="reader-heading">
            {renderInlines(block.inlines, `heading-${i}`)}
          </Tag>,
        )
        continue
      }
      if (block.kind === 'blockquote') {
        nodes.push(
          <blockquote key={`quote-${i}`} data-chunk-index={i} className="reader-quote">
            {renderInlines(block.inlines, `quote-${i}`)}
          </blockquote>,
        )
        continue
      }
      if (block.kind === 'pre') {
        nodes.push(
          <pre key={`pre-${i}`} data-chunk-index={i} className="reader-pre">
            <code>{renderInlines(block.inlines, `pre-${i}`)}</code>
          </pre>,
        )
        continue
      }
      if (block.kind === 'hr') {
        nodes.push(<hr key={`hr-${i}`} data-chunk-index={i} className="reader-hr" />)
        continue
      }
      if (block.kind === 'table' && block.table) {
        nodes.push(
          <div key={`table-${i}`} data-chunk-index={i} className="reader-table">
            <table>
              <tbody>
                {block.table.rows.map((row, rowIndex) => (
                  <tr key={`row-${i}-${rowIndex}`}>
                    {row.cells.map((cell, cellIndex) =>
                      cell.header ? (
                        <th key={`cell-${i}-${rowIndex}-${cellIndex}`}>
                          {renderInlines(cell.inlines, `cell-${i}-${rowIndex}-${cellIndex}`)}
                        </th>
                      ) : (
                        <td key={`cell-${i}-${rowIndex}-${cellIndex}`}>
                          {renderInlines(cell.inlines, `cell-${i}-${rowIndex}-${cellIndex}`)}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        )
        continue
      }
      if (block.kind === 'figure' && block.figure) {
        nodes.push(
          <figure key={`figure-${i}`} data-chunk-index={i} className="reader-figure">
            <div className="reader-figure-images">
              {block.figure.images.map((inline, idx) => (
                <div key={`fig-${i}-${idx}`}>{renderInlines([inline], `fig-${i}-${idx}`)}</div>
              ))}
            </div>
            {block.figure.caption.length > 0 ? (
              <figcaption className="reader-figure-caption">
                {renderInlines(block.figure.caption, `figcap-${i}`)}
              </figcaption>
            ) : null}
          </figure>,
        )
        continue
      }
      nodes.push(
        <p key={`para-${i}`} data-chunk-index={i} className="reader-paragraph">
          {renderInlines(block.inlines, `para-${i}`)}
        </p>,
      )
    }
    return nodes
  }

  function normalizeHref(href?: string | null) {
    if (!href) {
      return ''
    }
    let value = href.trim()
    if (!value) {
      return ''
    }
    if (value.includes('#')) {
      value = value.split('#')[0]
    }
    if (value.includes('?')) {
      value = value.split('?')[0]
    }
    value = value.replace(/^\.\//, '').replace(/^\//, '')
    return value
  }

  function normalizeAnchor(anchor?: string | null) {
    if (!anchor) {
      return ''
    }
    return anchor.replace(/^#/, '').trim()
  }

  function resolveInternalSectionId(
    href: string,
    baseHref: string | undefined,
    index: Map<string, string>,
  ) {
    const trimmed = href.trim()
    if (!trimmed) {
      return null
    }
    if (trimmed.startsWith('#')) {
      const anchorKey = `#${normalizeAnchor(trimmed)}`
      return index.get(anchorKey) ?? null
    }
    let link = trimmed
    let anchor = ''
    if (link.includes('#')) {
      const parts = link.split('#')
      link = parts[0] ?? ''
      anchor = parts[1] ?? ''
    }
    if (!link && baseHref) {
      link = baseHref
    }
    link = resolveRelativePath(baseHref ?? '', link)
    const baseKey = normalizeHref(link)
    const anchorKey = normalizeAnchor(anchor)
    if (baseKey && anchorKey) {
      return index.get(`${baseKey}#${anchorKey}`) ?? index.get(baseKey) ?? null
    }
    if (baseKey) {
      return index.get(baseKey) ?? null
    }
    if (anchorKey) {
      return index.get(`#${anchorKey}`) ?? null
    }
    return null
  }

  function resolveRelativePath(baseHref: string, relative: string) {
    if (!relative) {
      return normalizeHref(baseHref)
    }
    if (relative.startsWith('/')) {
      return normalizeHref(relative)
    }
    if (!baseHref) {
      return normalizeHref(relative)
    }
    const base = normalizeHref(baseHref)
    const baseParts = base.split('/').filter(Boolean)
    baseParts.pop()
    const relParts = relative.split('/').filter((part) => part !== '')
    for (const part of relParts) {
      if (part === '.' || part === '') {
        continue
      }
      if (part === '..') {
        baseParts.pop()
        continue
      }
      baseParts.push(part)
    }
    return baseParts.join('/')
  }

  const handleCreateBookmark = async () => {
    if (!sectionId || !parentRef.current || activeIndex < 0) {
      return
    }
    // Same layout-independent anchor as progress: block index + fraction
    // within it ("offset" carries the fraction).
    const anchor = findAnchor(parentRef.current)
    const label = window.prompt('Bookmark label (optional)') ?? undefined
    await createBookmark({
      sectionIndex: activeIndex,
      blockIndex: anchor.blockIndex,
      offset: anchor.fraction,
      label: label && label.length > 0 ? label : undefined,
    })
    setActiveSideTab('bookmarks')
    setIsTocOpen(true)
  }

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goNext()
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goPrev()
      }
      if (event.key === 'Escape' && !isPrefsOpen) {
        // The prefs modal has its own Escape handling — don't also close
        // the chapters panel underneath it.
        setIsTocOpen(false)
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goNext, goPrev, isPrefsOpen])

  const tabItems = [
    {
      key: 'toc' as const,
      label: 'Chapters',
      icon: (
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
        </svg>
      ),
    },
    {
      key: 'search' as const,
      label: 'Search',
      icon: (
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      ),
    },
    {
      key: 'bookmarks' as const,
      label: 'Bookmarks',
      icon: (
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
  ]

  const tocListClass = 'reader-scroll min-h-0 flex-1 overflow-auto pr-1'

  const tabControls = (
    <div className="flex gap-1">
      {tabItems.map((tab) => (
        <button
          key={tab.key}
          className={`chip ${activeSideTab === tab.key ? 'is-active' : ''}`}
          onClick={() => setActiveSideTab(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )

  const sidebarPanels = (
    <>
      {activeSideTab === 'toc' ? (
        !sections ? (
          <p className="text-sm text-[var(--muted)]">Loading sections...</p>
        ) : sections.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No sections yet. Parser output not loaded.
          </p>
        ) : (
          <div className={tocListClass} ref={tocListRef}>
            <div
              style={{
                height: tocVirtualizer.getTotalSize(),
                position: 'relative',
                width: '100%',
              }}
            >
              {tocVirtualizer.getVirtualItems().map((vi) => {
                const section = sections[vi.index]
                const isActive = section._id === sectionId
                return (
                  <button
                    key={section._id}
                    data-section-id={section._id}
                    data-index={vi.index}
                    ref={tocVirtualizer.measureElement}
                    className={`reader-row ${isActive ? 'is-active' : ''}`}
                    onClick={() => {
                      setActiveSectionId(section._id)
                      setIsTocOpen(false)
                    }}
                    disabled={isActive}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${vi.start}px)`,
                    }}
                  >
                    {section.title}
                  </button>
                )
              })}
            </div>
          </div>
        )
      ) : null}

      {activeSideTab === 'search' ? (
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
                ? 'Searching…'
                : searchQuery.trim().length >= 2
                  ? 'No matches.'
                  : 'Type at least two characters.'}
            </p>
          ) : (
            <div className="reader-scroll flex min-h-0 flex-1 flex-col overflow-auto">
              {searchResults.map((match) => (
                <button
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

      {activeSideTab === 'bookmarks' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {!bookmarks ? (
            <p className="text-sm text-[var(--muted)]">Loading bookmarks...</p>
          ) : bookmarks.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No bookmarks yet.</p>
          ) : (
            <div className="reader-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
              {bookmarks.map((bookmark) => {
                const targetSectionId =
                  sections?.[bookmark.sectionIndex]?._id ?? null
                const sectionTitle =
                  sections?.[bookmark.sectionIndex]?.title ?? 'Untitled chapter'
                const label = bookmark.label?.trim()
                const title = label || sectionTitle
                const jumpToBookmark = () => {
                  // Legacy rows stored absolute pixels; treat >1 as "top of
                  // the anchor block" instead of a bogus fraction.
                  const fraction =
                    bookmark.offset <= 1 ? bookmark.offset : 0
                  if (targetSectionId && targetSectionId !== sectionId) {
                    pendingChunkRef.current = {
                      blockIndex: bookmark.blockIndex,
                      fraction,
                    }
                    setActiveSectionId(targetSectionId)
                    return
                  }
                  const container = parentRef.current
                  if (container) {
                    const top = anchorScrollTop(
                      container,
                      bookmark.blockIndex,
                      fraction,
                    )
                    if (top !== null) {
                      container.scrollTop = top
                      lastAppliedScrollTopRef.current = container.scrollTop
                    }
                  }
                }
                return (
                  <div
                    key={bookmark.clientKey}
                    role="button"
                    tabIndex={0}
                    className="surface-soft relative shrink-0 cursor-pointer p-3 pr-10 text-xs transition hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                    onClick={jumpToBookmark}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        jumpToBookmark()
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
                      className="absolute bottom-3 right-3 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-[var(--muted-2)] transition hover:border-rose-500/40 hover:text-rose-300"
                      onClick={(event) => {
                        event.stopPropagation()
                        void deleteBookmark(bookmark.clientKey)
                      }}
                    >
                      <span className="sr-only">Remove bookmark</span>
                      <svg
                        aria-hidden="true"
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 6L6 18" />
                        <path d="M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : null}
    </>
  )

  const renderDrawer = () => (
    <>
      <div
        className={`reader-drawer-backdrop ${isTocOpen ? 'is-open' : ''}`}
        onClick={() => setIsTocOpen(false)}
      />
      <aside className={`reader-drawer ${isTocOpen ? 'is-open' : ''}`}>
        <div className="border-b border-[color-mix(in_srgb,var(--outline)_60%,transparent)] px-4 pb-2.5 pt-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-[family-name:var(--font-display)] text-base text-[var(--ink)]">
                {bookTitle || 'Reading'}
              </div>
              {sections && activeIndex >= 0 ? (
                <div className="mt-0.5 text-xs text-[var(--muted-2)]">
                  {`Chapter ${activeIndex + 1} of ${sections.length}`}
                </div>
              ) : null}
            </div>
            <button
              className="icon-btn -mr-1 -mt-0.5 shrink-0"
              onClick={() => setIsTocOpen(false)}
            >
            <span className="sr-only">Close panel</span>
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
            </button>
          </div>
          <div className="mt-2">{tabControls}</div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col p-3">{sidebarPanels}</div>
      </aside>
    </>
  )

  return (
    <RequireAuth>
      <div className={`reader-shell ${themeClass} text-[var(--reader-ink)]`}>
        <div className="reader-topbar">
          <Link
            className="icon-btn tooltip shrink-0"
            data-tooltip="Library"
            data-tooltip-position="bottom"
            to="/library"
          >
            <span className="sr-only">Back to library</span>
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="reader-topbar-title">
            {activeSection?.title ?? 'Reading'}
          </div>
          {sections && sections.length > 0 && activeIndex >= 0 ? (
            <div
              className="hidden shrink-0 text-xs text-[var(--muted-2)] sm:block"
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
              className="icon-btn tooltip"
              data-tooltip="Bookmark"
              data-tooltip-position="bottom"
              onClick={handleCreateBookmark}
              disabled={!sectionId}
            >
              <span className="sr-only">Bookmark</span>
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            <button
              className="icon-btn tooltip"
              data-tooltip="Previous chapter"
              data-tooltip-position="bottom"
              onClick={goPrev}
              disabled={!sections || activeIndex <= 0}
            >
              <span className="sr-only">Previous chapter</span>
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              className="icon-btn tooltip"
              data-tooltip="Next chapter"
              data-tooltip-position="bottom"
              onClick={goNext}
              disabled={!sections || activeIndex < 0 || activeIndex >= sections.length - 1}
            >
              <span className="sr-only">Next chapter</span>
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
            <button
              className={`icon-btn tooltip ${isTocOpen ? 'is-active' : ''}`}
              data-tooltip="Chapters"
              data-tooltip-position="bottom"
              onClick={() => setIsTocOpen((prev) => !prev)}
            >
              <span className="sr-only">Chapters</span>
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </svg>
            </button>
            <button
              className="icon-btn tooltip"
              data-tooltip="Reader preferences"
              data-tooltip-position="bottom"
              onClick={() => setIsPrefsOpen(true)}
            >
              <span className="sr-only">Reader preferences</span>
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08A1.65 1.65 0 0 0 9 4.09V4a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.08a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08A1.65 1.65 0 0 0 19.91 11H20a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>

        <div
          className="reader-content relative"
          style={{ '--reader-content-w': `${contentWidth}px` } as CSSProperties}
        >
          <button
            // Not `disabled`: browsers suppress wheel events on disabled
            // controls, which would deaden the margin for scrolling on the
            // first/last chapter. Inert state is styled + guarded instead.
            className={`reader-edge-nav is-left ${
              !sections || activeIndex <= 0 ? 'is-inert' : ''
            }`}
            aria-label="Previous chapter"
            aria-disabled={!sections || activeIndex <= 0}
            onClick={() => {
              if (sections && activeIndex > 0) {
                goPrev()
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </span>
          </button>
          <button
            className={`reader-edge-nav is-right ${
              !sections || activeIndex < 0 || activeIndex >= sections.length - 1
                ? 'is-inert'
                : ''
            }`}
            aria-label="Next chapter"
            aria-disabled={
              !sections || activeIndex < 0 || activeIndex >= sections.length - 1
            }
            onClick={() => {
              if (sections && activeIndex >= 0 && activeIndex < sections.length - 1) {
                goNext()
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
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
            <div
              ref={parentRef}
              className="reader-scroll h-full overflow-auto px-6 py-10 text-left"
              style={{
                fontSize: `${fontSize}px`,
                lineHeight: lineHeight,
                fontFamily:
                  fontFamily === 'serif'
                    ? 'var(--font-display)'
                    : 'var(--font-body)',
              }}
            >
              <div className="mx-auto" style={{ maxWidth: `${contentWidth}px` }}>
                {!blocks || blocks.length === 0 ? (
                  <h1 className="mb-6 text-2xl text-[var(--reader-ink)]">
                    {activeSection?.title ?? 'Untitled chapter'}
                  </h1>
                ) : null}
                {(blocks && blocks.length > 0 ? false : chunks.length === 0) ? (
                  <p className="text-sm text-[var(--reader-muted)]">
                    {isSeeding
                      ? 'Downloading book to this device…'
                      : seedError
                        ? `Could not download this book: ${seedError}`
                        : sectionId
                          ? 'Loading chapter...'
                          : 'Select a chapter to begin reading.'}
                  </p>
                ) : (
                  blocks && blocks.length > 0
                    ? renderBlocks(blocks)
                    : chunks.map((chunk, index) => (
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
              </div>
            </div>
          )}
        </div>

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
  )
}
