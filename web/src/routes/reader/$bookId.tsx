import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { useLocalUser } from '../../hooks/useLocalUser'
import { RequireAuth } from '../../components/RequireAuth'

type ReaderChunk = {
  id: string
  content: string
}

type InlinePayload = {
  kind: string
  text?: string
  href?: string
  src?: string
  alt?: string
  emph?: boolean
  strong?: boolean
}

type TableCellPayload = {
  inlines: InlinePayload[]
  header?: boolean
}

type TablePayload = {
  rows: { cells: TableCellPayload[] }[]
}

type FigurePayload = {
  images: InlinePayload[]
  caption: InlinePayload[]
}

type BlockPayload = {
  kind: string
  level?: number
  ordered?: boolean
  listIndex?: number
  inlines?: InlinePayload[]
  table?: TablePayload
  figure?: FigurePayload
  anchors?: string[]
}

export const Route = createFileRoute('/reader/$bookId')({
  component: Reader,
})

function Reader() {
  const { bookId } = Route.useParams()
  const userId = useLocalUser()
  const sections = useQuery(api.sections.listSections, { bookId })
  const getSectionContent = useAction(api.reader.getSectionContent)
  const updateProgress = useMutation(api.userBooks.updateProgress)
  const userBook = useQuery(
    api.userBooks.getUserBook,
    userId ? { userId, bookId } : 'skip',
  )
  const userSettings = useQuery(
    api.userSettings.getByUser,
    userId ? { userId } : 'skip',
  )
  const saveSettings = useMutation(api.userSettings.upsert)
  const bookmarks = useQuery(
    api.bookmarks.listByUserBook,
    userId ? { userId, bookId } : 'skip',
  )
  const imageUrls = useQuery(api.bookAssets.getUrlsByBook, { bookId })
  const createBookmark = useMutation(api.bookmarks.createBookmark)
  const deleteBookmark = useMutation(api.bookmarks.deleteBookmark)
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [chunks, setChunks] = useState<ReaderChunk[]>([])
  const [blocks, setBlocks] = useState<BlockPayload[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [fontScale, setFontScale] = useState(0)
  const [lineHeight, setLineHeight] = useState(1.7)
  const [contentWidth, setContentWidth] = useState(720)
  const [theme, setTheme] = useState('night')
  const [isTocOpen, setIsTocOpen] = useState(false)
  const [activeSideTab, setActiveSideTab] = useState<'toc' | 'search' | 'bookmarks'>('toc')
  const [isPrefsOpen, setIsPrefsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const parentRef = useRef<HTMLDivElement | null>(null)
  const activeSectionRef = useRef<string | null>(null)
  const lastProgressAtRef = useRef<number>(0)
  const restoredSectionRef = useRef<string | null>(null)
  const pendingScrollRef = useRef<number | null>(null)
  const loadingSectionRef = useRef<string | null>(null)
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false)

  useEffect(() => {
    if (!userSettings || isPrefsOpen) {
      return
    }
    setFontScale(userSettings.fontScale ?? 0)
    setLineHeight(userSettings.lineHeight ?? 1.7)
    setContentWidth(userSettings.contentWidth ?? 720)
    setTheme(userSettings.theme ?? 'night')
  }, [userSettings, isPrefsOpen])

  useEffect(() => {
    document.body.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const media = window.matchMedia('(min-width: 1024px)')
    setIsTocOpen(media.matches)
    const handleChange = () => setIsTocOpen(media.matches)
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

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

  const sectionTitleById = useMemo(() => {
    if (!sections) {
      return new Map<string, string>()
    }
    return new Map(sections.map((section) => [section._id, section.title]))
  }, [sections])

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
    if (activeSectionId) {
      return
    }
    if (userBook?.lastSectionId) {
      const match = sections.find(
        (section) => section._id === userBook.lastSectionId,
      )
      if (match) {
        setActiveSectionId(match._id)
        return
      }
    }
    setActiveSectionId(sections[0]._id)
  }, [sections, activeSectionId, userBook])

  const loadSection = async (targetId: string | null) => {
    if (!targetId) {
      return
    }
    loadingSectionRef.current = targetId
    setIsLoading(true)
    const { text, blocks } = await getSectionContent({ sectionId: targetId })
    if (activeSectionRef.current !== targetId) {
      if (loadingSectionRef.current === targetId) {
        setIsLoading(false)
      }
      return
    }
    setBlocks(Array.isArray(blocks) ? (blocks as BlockPayload[]) : null)
    const paragraphs = text.split(/\n{2,}/).filter(Boolean)
    setChunks(
      paragraphs.map((content, index) => ({
        id: `${targetId}-${index}`,
        content,
      })),
    )
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
    if (!userId || !sectionId || !parentRef.current) {
      return
    }
    const container = parentRef.current
    const scrollTop = container.scrollTop
    let chunkIndex = 0
    const nodes = Array.from(
      container.querySelectorAll('[data-chunk-index]'),
    )
    for (const node of nodes) {
      const element = node as HTMLElement
      if (element.offsetTop + element.clientHeight > scrollTop) {
        chunkIndex = Number(element.dataset.chunkIndex ?? 0)
        break
      }
    }
    void updateProgress({
      userId,
      bookId,
      lastSectionId: sectionId,
      lastChunkIndex: chunkIndex,
      lastChunkOffset: scrollTop,
    })
  }

  useEffect(() => {
    if (!userId || !sectionId) {
      return
    }
    emitProgress()
  }, [userId, bookId, sectionId])

  useEffect(() => {
    const container = parentRef.current
    if (!container) {
      return
    }
    const handleScroll = () => {
      const now = Date.now()
      if (now - lastProgressAtRef.current < 800) {
        return
      }
      lastProgressAtRef.current = now
      emitProgress()
    }
    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [sectionId, userId])

  useEffect(() => {
    restoredSectionRef.current = null
  }, [sectionId])

  useEffect(() => {
    const container = parentRef.current
    if (!container || !sectionId) {
      return
    }
    if (restoredSectionRef.current === sectionId) {
      return
    }
    if (pendingScrollRef.current !== null) {
      container.scrollTop = pendingScrollRef.current
      pendingScrollRef.current = null
      restoredSectionRef.current = sectionId
      return
    }
    if (userBook?.lastSectionId === sectionId) {
      container.scrollTop = userBook.lastChunkOffset ?? 0
      restoredSectionRef.current = sectionId
      return
    }
    container.scrollTop = 0
    restoredSectionRef.current = sectionId
  }, [sectionId, chunks.length, userBook?.lastSectionId, userBook?.lastChunkOffset])

  const searchMatches = useMemo(() => {
    const source = blocks && blocks.length > 0
      ? blocks.map((block) => blockToText(block))
      : chunks.map((chunk) => chunk.content)
    if (!searchQuery.trim() || source.length === 0) {
      return []
    }
    const query = searchQuery.toLowerCase()
    return source
      .map((content, index) => {
        const pos = content.toLowerCase().indexOf(query)
        if (pos < 0) {
          return null
        }
        const start = Math.max(0, pos - 40)
        const end = Math.min(content.length, pos + query.length + 40)
        const snippet = content.slice(start, end)
        return { index, snippet }
      })
      .filter((match): match is { index: number; snippet: string } => !!match)
  }, [searchQuery, chunks, blocks])

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

  function inlineToText(inline: InlinePayload) {
    if (inline.kind === 'image') {
      return inline.alt ?? ''
    }
    return inline.text ?? ''
  }

  function inlinesToText(inlines?: InlinePayload[]) {
    if (!inlines || inlines.length === 0) {
      return ''
    }
    return inlines.map(inlineToText).join(' ').trim()
  }

  function blockToText(block: BlockPayload) {
    if (block.table?.rows) {
      return block.table.rows
        .map((row) =>
          row.cells.map((cell) => inlinesToText(cell.inlines)).join(' '),
        )
        .join('\n')
        .trim()
    }
    if (block.figure) {
      const caption = inlinesToText(block.figure.caption)
      if (caption) {
        return caption
      }
      return inlinesToText(block.figure.images)
    }
    return inlinesToText(block.inlines)
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
            href.startsWith('http://') || href.startsWith('https://')
          return (
            <a
              key={key}
              href={href}
              className="reader-link"
              target={external ? '_blank' : undefined}
              rel={external ? 'noreferrer' : undefined}
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
          return (
            <img
              key={key}
              src={src}
              alt={inline.alt ?? ''}
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
    for (let i = 0; i < contentBlocks.length; i += 1) {
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

  const handleCreateBookmark = async () => {
    if (!userId || !sectionId || !parentRef.current) {
      return
    }
    const container = parentRef.current
    const scrollTop = container.scrollTop
    let chunkIndex = 0
    const nodes = Array.from(
      container.querySelectorAll('[data-chunk-index]'),
    )
    for (const node of nodes) {
      const element = node as HTMLElement
      if (element.offsetTop + element.clientHeight > scrollTop) {
        chunkIndex = Number(element.dataset.chunkIndex ?? 0)
        break
      }
    }
    const label = window.prompt('Bookmark label (optional)') ?? undefined
    await createBookmark({
      userId,
      bookId,
      sectionId,
      chunkIndex,
      offset: scrollTop,
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
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [goNext, goPrev])

  return (
    <RequireAuth>
      <div className="min-h-screen px-4 pb-16 pt-10 sm:px-6">
        <div
          className={`mx-auto w-full ${
            isTocOpen ? 'max-w-6xl' : 'max-w-7xl lg:pr-16'
          }`}
        >
          <div className="surface flex flex-wrap items-center justify-between gap-4 rounded-[22px] px-5 py-3">
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase tracking-[0.3em] text-[var(--muted-2)]">
                {activeSection?.title ?? 'Reading'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="btn btn-ghost text-xs tooltip"
                data-tooltip="Bookmark"
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
                className="btn btn-ghost text-xs tooltip"
                data-tooltip="Previous chapter"
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
                className="btn btn-ghost text-xs tooltip"
                data-tooltip="Next chapter"
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
                className="btn btn-ghost text-xs tooltip"
                data-tooltip="Chapters"
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
                className="btn btn-outline text-xs tooltip"
                data-tooltip="Reader prefs"
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
            className={`relative mt-8 grid gap-6 ${
              isTocOpen ? 'lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10' : 'lg:grid-cols-1'
            }`}
          >
            <div
              className={`fixed inset-0 z-30 bg-black/40 transition-opacity lg:hidden ${
                isTocOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
              onClick={() => setIsTocOpen(false)}
            />
            <aside
              className={`surface relative fixed right-6 left-auto top-28 z-40 h-[70vh] w-[80vw] max-w-sm overflow-hidden rounded-[24px] p-5 pl-12 transition-transform lg:static lg:order-2 lg:top-auto lg:h-auto lg:w-auto lg:justify-self-end ${
                isTocOpen ? 'translate-x-0' : 'translate-x-[120%]'
              } ${!isTocOpen ? 'lg:hidden' : ''}`}
            >
              <button
                className="toc-rail-shell is-open tooltip"
                data-tooltip="Collapse"
                data-tooltip-position="right"
                onClick={() => setIsTocOpen(false)}
              >
                <span className="sr-only">Collapse</span>
                <span className="toc-rail-chevron" aria-hidden="true">
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
                </span>
              </button>
              <div className="flex items-center justify-between">
                <div className="text-sm uppercase tracking-[0.4em] text-[var(--muted-2)]">
                  Chapters
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                  {([
                  { key: 'toc', label: 'Chapters' },
                  { key: 'search', label: 'Search' },
                  { key: 'bookmarks', label: 'Bookmarks' },
                ] as const).map((tab) => (
                  <button
                    key={tab.key}
                    className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.3em] ${
                      activeSideTab === tab.key
                        ? 'border-[rgba(209,161,92,0.6)] bg-[rgba(209,161,92,0.15)] text-[var(--accent)]'
                        : 'border-white/10 text-[var(--muted-2)]'
                    }`}
                    onClick={() => setActiveSideTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeSideTab === 'toc' ? (
                !sections ? (
                  <p className="mt-4 text-sm text-[var(--muted)]">
                    Loading sections...
                  </p>
                ) : sections.length === 0 ? (
                  <p className="mt-4 text-sm text-[var(--muted)]">
                    No sections yet. Parser output not loaded.
                  </p>
                ) : (
                  <div className="mt-4 flex max-h-[55vh] flex-col gap-2 overflow-auto pr-2">
                    {sections.map((section, index) => {
                      const isActive = section._id === sectionId
                      return (
                        <button
                          key={section._id}
                          className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${
                            isActive
                              ? 'border-[rgba(209,161,92,0.6)] bg-[rgba(209,161,92,0.15)] text-[var(--ink)]'
                              : 'border-white/10 bg-[rgba(12,15,18,0.6)] text-[var(--muted)] hover:border-white/30'
                          }`}
                          onClick={() => {
                            setActiveSectionId(section._id)
                          }}
                          disabled={isActive}
                        >
                          <div className="text-xs uppercase tracking-[0.3em] text-[var(--muted-2)]">
                            {index + 1}
                          </div>
                          <div className="mt-1 text-base text-[var(--ink)]">
                            {section.title}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )
              ) : null}

              {activeSideTab === 'search' ? (
                <div className="mt-4">
                  <input
                    className="input"
                    placeholder="Search this chapter..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                  {searchMatches.length === 0 ? (
                    <p className="mt-4 text-sm text-[var(--muted)]">
                      {searchQuery ? 'No matches.' : 'Type to search.'}
                    </p>
                  ) : (
                    <div className="mt-4 flex max-h-[50vh] flex-col gap-2 overflow-auto">
                      {searchMatches.map((match) => (
                        <button
                          key={`${match.index}-${match.snippet}`}
                          className="rounded-2xl border border-white/10 bg-[rgba(12,15,18,0.6)] p-3 text-left text-xs text-[var(--muted)] hover:border-[rgba(209,161,92,0.4)]"
                          onClick={() => scrollToChunk(match.index)}
                        >
                          {match.snippet}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {activeSideTab === 'bookmarks' ? (
                <div className="mt-4">
                  {!bookmarks ? (
                    <p className="text-sm text-[var(--muted)]">
                      Loading bookmarks...
                    </p>
                  ) : bookmarks.length === 0 ? (
                    <p className="text-sm text-[var(--muted)]">
                      No bookmarks yet.
                    </p>
                  ) : (
                    <div className="flex max-h-[50vh] flex-col gap-3 overflow-auto">
                      {bookmarks.map((bookmark) => (
                        <div
                          key={bookmark._id}
                          className="rounded-2xl border border-white/10 bg-[rgba(12,15,18,0.6)] p-3 text-xs text-[var(--muted)]"
                        >
                          <div className="text-[var(--ink)]">
                            {bookmark.label ?? 'Bookmark'}
                          </div>
                          {(() => {
                            const chapterIndex = sections
                              ? sections.findIndex(
                                  (section) => section._id === bookmark.sectionId,
                                )
                              : -1
                            return (
                              <div className="mt-1 text-[10px] uppercase tracking-[0.3em] text-[var(--muted-2)]">
                                {chapterIndex >= 0
                                  ? `Chapter ${chapterIndex + 1}`
                                  : 'Chapter'}
                              </div>
                            )
                          })()}
                          <div className="mt-1 text-sm text-[var(--muted)]">
                            {sectionTitleById.get(bookmark.sectionId) ??
                              'Untitled chapter'}
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <button
                              className="text-[var(--accent)]"
                              onClick={() => {
                                if (bookmark.sectionId !== sectionId) {
                                  pendingScrollRef.current = bookmark.offset
                                  setActiveSectionId(bookmark.sectionId)
                                  return
                                }
                                scrollToChunk(bookmark.chunkIndex)
                                if (parentRef.current) {
                                  parentRef.current.scrollTop = bookmark.offset
                                }
                              }}
                            >
                              Go to
                            </button>
                            <button
                              className="text-[var(--danger)]"
                              onClick={() =>
                                deleteBookmark({
                                  bookmarkId: bookmark._id,
                                  userId: userId!,
                                })
                              }
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </aside>

            {!isTocOpen ? (
              <div
                className="toc-rail-shell is-closed hidden lg:flex"
                onClick={() => setIsTocOpen(true)}
              >
                <span className="toc-rail-chevron" aria-hidden="true">
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
                </span>
                <div className="toc-rail-divider" aria-hidden="true" />
                {([
                  { key: 'toc', label: 'Chapters' },
                  { key: 'search', label: 'Search' },
                  { key: 'bookmarks', label: 'Bookmarks' },
                ] as const).map((tab) => (
                  <button
                    key={tab.key}
                    className={`toc-rail-btn tooltip ${
                      activeSideTab === tab.key ? 'is-active' : ''
                    }`}
                    data-tooltip={tab.label}
                    data-tooltip-position="left"
                    onClick={(event) => {
                      event.stopPropagation()
                      setActiveSideTab(tab.key)
                      setIsTocOpen(true)
                    }}
                  >
                    <span className="sr-only">{tab.label}</span>
                    {tab.key === 'toc' ? (
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
                    ) : tab.key === 'search' ? (
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
                    ) : (
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
                    )}
                  </button>
                ))}
              </div>
            ) : null}

            <section className={`card relative overflow-hidden ${themeClass} text-[var(--reader-ink)] lg:order-1`}>
              {!userId ? (
                <p className="p-6 text-sm text-[var(--muted)]">
                  Loading user...
                </p>
              ) : null}
              {showLoadingOverlay ? (
                <div className="pointer-events-none absolute right-6 top-6 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--reader-muted)]">
                  Loading chapter
                </div>
              ) : null}
              <div
                ref={parentRef}
                className="h-[70vh] overflow-auto px-6 py-8 text-left"
                style={{
                  fontSize: `${fontSize}px`,
                  lineHeight: lineHeight,
                }}
              >
                <div className="mb-6">
                  <h1 className="text-2xl text-[var(--reader-ink)]">
                    {activeSection?.title ?? 'Untitled chapter'}
                  </h1>
                </div>
                <div
                  className="mx-auto"
                  style={{ maxWidth: `${contentWidth}px` }}
                >
                  {(blocks && blocks.length > 0 ? false : chunks.length === 0) ? (
                    <p className="text-sm text-[var(--reader-muted)]">
                      {sectionId ? 'Loading chapter...' : 'Select a chapter to begin reading.'}
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
            </section>
          </div>
        </div>
      </div>

      {isPrefsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="surface w-full max-w-lg rounded-[24px] p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl">Reader Preferences</h2>
              <button
                className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]"
                onClick={() => setIsPrefsOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="mt-6 space-y-5 text-sm text-[var(--muted)]">
              <div>
                <div className="text-xs uppercase tracking-[0.3em]">Font size</div>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    className="btn btn-ghost text-xs"
                    onClick={() => setFontScale((prev) => Math.max(prev - 1, -1))}
                  >
                    A-
                  </button>
                  <div className="text-xs uppercase tracking-[0.3em] text-[var(--muted-2)]">
                    {fontSize}px
                  </div>
                  <button
                    className="btn btn-ghost text-xs"
                    onClick={() => setFontScale((prev) => Math.min(prev + 1, 3))}
                  >
                    A+
                  </button>
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.3em]">Line height</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[1.5, 1.7, 1.9, 2.1].map((value) => (
                    <button
                      key={value}
                      className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.3em] ${
                        lineHeight === value
                          ? 'border-[rgba(209,161,92,0.6)] bg-[rgba(209,161,92,0.15)] text-[var(--accent)]'
                          : 'border-white/10 text-[var(--muted-2)]'
                      }`}
                      onClick={() => setLineHeight(value)}
                    >
                      {value.toFixed(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.3em]">Content width</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    { label: 'Narrow', value: 560 },
                    { label: 'Comfort', value: 720 },
                    { label: 'Wide', value: 880 },
                  ].map((option) => (
                    <button
                      key={option.label}
                      className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.3em] ${
                        contentWidth === option.value
                          ? 'border-[rgba(209,161,92,0.6)] bg-[rgba(209,161,92,0.15)] text-[var(--accent)]'
                          : 'border-white/10 text-[var(--muted-2)]'
                      }`}
                      onClick={() => setContentWidth(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.3em]">Theme</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {['night', 'sepia', 'paper'].map((option) => (
                    <button
                      key={option}
                      className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.3em] ${
                        theme === option
                          ? 'border-[rgba(209,161,92,0.6)] bg-[rgba(209,161,92,0.15)] text-[var(--accent)]'
                          : 'border-white/10 text-[var(--muted-2)]'
                      }`}
                      onClick={() => setTheme(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-between">
              <button className="btn btn-ghost text-xs" onClick={() => setIsPrefsOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary text-xs"
                onClick={async () => {
                  if (!userId) return
                  await saveSettings({
                    userId,
                    fontScale,
                    lineHeight,
                    contentWidth,
                    theme,
                  })
                  setIsPrefsOpen(false)
                }}
              >
                Save preferences
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </RequireAuth>
  )
}
