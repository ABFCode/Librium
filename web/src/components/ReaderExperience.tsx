import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAction, useConvexAuth, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { RequireAuth } from './RequireAuth'
import { useUserSettings } from '../hooks/useUserSettings'
import { ReaderPreferencesModal } from './ReaderPreferencesModal'

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
  width?: number
  height?: number
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

type ReaderExperienceProps = {
  bookId: string
}

export function ReaderExperience({ bookId }: ReaderExperienceProps) {
  const { isAuthenticated } = useConvexAuth()
  const canQuery = isAuthenticated
  const sections = useQuery(
    api.sections.listSections,
    canQuery ? { bookId } : 'skip',
  )
  const getSectionContent = useAction(api.reader.getSectionContent)
  const updateProgress = useMutation(api.userBooks.updateProgress)
  const userBook = useQuery(
    api.userBooks.getUserBook,
    canQuery ? { bookId } : 'skip',
  )
  const bookmarks = useQuery(
    api.bookmarks.listByUserBook,
    canQuery ? { bookId } : 'skip',
  )
  const createBookmark = useMutation(api.bookmarks.createBookmark)
  const deleteBookmark = useMutation(api.bookmarks.deleteBookmark)
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [chunks, setChunks] = useState<ReaderChunk[]>([])
  const [blocks, setBlocks] = useState<BlockPayload[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isTocOpen, setIsTocOpen] = useState(false)
  const [activeSideTab, setActiveSideTab] = useState<'toc' | 'search' | 'bookmarks'>('toc')
  const [isPrefsOpen, setIsPrefsOpen] = useState(false)
  const [isRestoringView, setIsRestoringView] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [tocReady, setTocReady] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const parentRef = useRef<HTMLDivElement | null>(null)
  const activeSectionRef = useRef<string | null>(null)
  const lastProgressAtRef = useRef<number>(0)
  const restoredSectionRef = useRef<string | null>(null)
  const pendingScrollRef = useRef<number | null>(null)
  const loadingSectionRef = useRef<string | null>(null)
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false)
  const restoredFromUserBookRef = useRef(false)
  const tocInitRef = useRef(false)
  const initialProgressRef = useRef(false)
  const isRestoringRef = useRef(false)
  const scrollRestoredRef = useRef<string | null>(null)
  const restoreTokenRef = useRef(0)
  const tocListRef = useRef<HTMLDivElement | null>(null)
  const fontsReadyRef = useRef<Promise<void> | null>(null)
  const {
    fontScale,
    lineHeight,
    contentWidth,
    theme,
    setFontScale,
    setLineHeight,
    setContentWidth,
    setTheme,
  } = useUserSettings({ pauseSync: isPrefsOpen })

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const media = window.matchMedia('(min-width: 1024px)')
    if (!tocInitRef.current) {
      const saved = window.localStorage.getItem('reader:tocOpen')
      if (saved !== null) {
        setIsTocOpen(saved === 'true')
      } else {
        setIsTocOpen(media.matches)
      }
      tocInitRef.current = true
      setTocReady(true)
    }
    const handleChange = () => {
      const stored = window.localStorage.getItem('reader:tocOpen')
      if (stored !== null) {
        setIsTocOpen(stored === 'true')
      } else {
        setIsTocOpen(media.matches)
      }
    }
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  const sectionId = activeSectionId ?? null

  useEffect(() => {
    activeSectionRef.current = sectionId
  }, [sectionId])

  useEffect(() => {
    if (!tocReady || typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem('reader:tocOpen', String(isTocOpen))
  }, [isTocOpen, tocReady])

  const activeSection = useMemo(() => {
    if (!sections || !sectionId) {
      return null
    }
    return sections.find((section) => section._id === sectionId) ?? null
  }, [sections, sectionId])

  useLayoutEffect(() => {
    if (!sectionId) {
      return
    }
    if (scrollRestoredRef.current === sectionId) {
      return
    }
    if (userBook?.lastSectionId !== sectionId) {
      return
    }
    const shouldRestore =
      (userBook.lastScrollTop ?? 0) > 0 ||
      (userBook.lastScrollRatio ?? 0) > 0.001 ||
      (userBook.lastChunkIndex ?? 0) > 0 ||
      (userBook.lastChunkOffset ?? 0) > 0
    if (shouldRestore) {
      setIsRestoringView(true)
    }
  }, [
    sectionId,
    userBook?.lastSectionId,
    userBook?.lastScrollTop,
    userBook?.lastScrollRatio,
    userBook?.lastChunkIndex,
    userBook?.lastChunkOffset,
  ])

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

  const imageUrls = useQuery(
    api.bookAssets.getUrlsByBook,
    canQuery && imageHrefs.length > 0
      ? { bookId, hrefs: imageHrefs }
      : 'skip',
  )

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
    if (userBook?.lastSectionId && !restoredFromUserBookRef.current) {
      const match = sections.find(
        (section) => section._id === userBook.lastSectionId,
      )
      if (match && match._id !== activeSectionId) {
        setActiveSectionId(match._id)
        restoredFromUserBookRef.current = true
        return
      }
      restoredFromUserBookRef.current = true
    }
    if (!activeSectionId) {
      setActiveSectionId(sections[0]._id)
    }
  }, [sections, activeSectionId, userBook?.lastSectionId])

  const loadSection = async (targetId: string | null) => {
    if (!targetId || !canQuery) {
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
    if (!canQuery || !sectionId || !parentRef.current) {
      return
    }
    if (userBook === undefined) {
      return
    }
    if (userBook?.lastSectionId && !restoredFromUserBookRef.current) {
      return
    }
    if (isRestoringRef.current) {
      return
    }
    const container = parentRef.current
    const scrollTop = container.scrollTop
    const maxScroll = Math.max(1, container.scrollHeight - container.clientHeight)
    const scrollRatio = Math.min(1, Math.max(0, scrollTop / maxScroll))
    let chunkIndex = 0
    let offsetWithin = 0
    const nodes = Array.from(
      container.querySelectorAll('[data-chunk-index]'),
    )
    for (const node of nodes) {
      const element = node as HTMLElement
      if (element.offsetTop + element.clientHeight > scrollTop) {
        chunkIndex = Number(element.dataset.chunkIndex ?? 0)
        offsetWithin = Math.max(0, scrollTop - element.offsetTop)
        break
      }
    }
    void updateProgress({
      bookId,
      lastSectionId: sectionId,
      lastSectionIndex: activeIndex >= 0 ? activeIndex : 0,
      lastChunkIndex: chunkIndex,
      lastChunkOffset: offsetWithin,
      lastScrollRatio: scrollRatio,
      lastScrollTop: scrollTop,
      lastScrollHeight: container.scrollHeight,
      lastClientHeight: container.clientHeight,
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
      const now = Date.now()
      if (now - lastProgressAtRef.current < 800) {
        return
      }
      lastProgressAtRef.current = now
      emitProgress()
    }
    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
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
  }, [sectionId, userBook])

  useEffect(() => {
    restoredSectionRef.current = null
  }, [sectionId])

  useEffect(() => {
    if (!isTocOpen || activeSideTab !== 'toc' || !sectionId) {
      return
    }
    const container = tocListRef.current
    if (!container) {
      return
    }
    const id = window.requestAnimationFrame(() => {
      const target = container.querySelector(
        `[data-section-id="${sectionId}"]`,
      ) as HTMLElement | null
      if (target) {
        target.scrollIntoView({ block: 'center' })
      }
    })
    return () => window.cancelAnimationFrame(id)
  }, [isTocOpen, activeSideTab, sectionId, sections])

  useLayoutEffect(() => {
    const container = parentRef.current
    if (!container || !sectionId) {
      return
    }
    const hasContent = (blocks && blocks.length > 0) || chunks.length > 0
    if (!hasContent) {
      return
    }
    if (pendingScrollRef.current !== null) {
      setIsRestoringView(false)
      container.scrollTop = pendingScrollRef.current
      pendingScrollRef.current = null
      restoredSectionRef.current = sectionId
      scrollRestoredRef.current = sectionId
      return
    }
    if (userBook?.lastSectionId === sectionId) {
      if (scrollRestoredRef.current === sectionId) {
        setIsRestoringView(false)
        return
      }
      const targetIndex = userBook.lastChunkIndex ?? 0
      const targetOffset = userBook.lastChunkOffset ?? 0
      const targetRatio = userBook.lastScrollRatio
      const targetScrollTop = userBook.lastScrollTop
      const targetScrollHeight = userBook.lastScrollHeight
      const targetClientHeight = userBook.lastClientHeight
      const shouldRestore =
        (targetRatio !== undefined && targetRatio > 0.001) ||
        targetOffset > 0 ||
        targetIndex > 0 ||
        (targetScrollTop !== undefined && targetScrollTop > 0)
      if (!shouldRestore) {
        container.scrollTop = 0
        setIsRestoringView(false)
        scrollRestoredRef.current = sectionId
        restoredSectionRef.current = sectionId
        return
      }
      setIsRestoringView(true)
      const restoreByRatio = () => {
        if (targetRatio === undefined) {
          return false
        }
        const maxScroll = Math.max(1, container.scrollHeight - container.clientHeight)
        container.scrollTop = Math.round(targetRatio * maxScroll)
        return true
      }
      const restoreByScrollTop = () => {
        if (targetScrollTop === undefined) {
          return false
        }
        if (targetClientHeight === undefined || targetScrollHeight === undefined) {
          container.scrollTop = targetScrollTop
          return true
        }
        const heightDelta = Math.abs(container.clientHeight - targetClientHeight)
        const scrollDelta = Math.abs(container.scrollHeight - targetScrollHeight)
        if (heightDelta > 6 || scrollDelta > 24) {
          return false
        }
        container.scrollTop = targetScrollTop
        return true
      }
      const restoreByChunk = () => {
        const target = container.querySelector(
          `[data-chunk-index="${targetIndex}"]`,
        ) as HTMLElement | null
        if (!target) {
          return false
        }
        container.scrollTop = target.offsetTop + targetOffset
        return true
      }
      const restoredNow = restoreByScrollTop() || restoreByChunk() || restoreByRatio()
      if (!restoredNow) {
        container.scrollTop = 0
        setIsRestoringView(false)
        scrollRestoredRef.current = sectionId
        restoredSectionRef.current = sectionId
        return
      }
      scrollRestoredRef.current = sectionId
      restoredSectionRef.current = sectionId
      isRestoringRef.current = true
      const restoreToken = ++restoreTokenRef.current
      const restoreNow = () =>
        restoreByScrollTop() || restoreByChunk() || restoreByRatio()
      void waitForFonts().then(() => {
        if (restoreTokenRef.current !== restoreToken) {
          return
        }
        window.requestAnimationFrame(() => {
          restoreNow()
          window.requestAnimationFrame(() => {
            if (restoreTokenRef.current !== restoreToken) {
              return
            }
            restoreNow()
            isRestoringRef.current = false
            setIsRestoringView(false)
          })
        })
      })
      return
    }
    if (userBook === null && !initialProgressRef.current) {
      setIsRestoringView(false)
      initialProgressRef.current = true
      void updateProgress({
        bookId,
        lastSectionId: sectionId,
        lastSectionIndex: activeIndex >= 0 ? activeIndex : 0,
        lastChunkIndex: 0,
        lastChunkOffset: 0,
        lastScrollRatio: 0,
        lastScrollTop: 0,
        lastScrollHeight: 0,
        lastClientHeight: 0,
      })
    }
    container.scrollTop = 0
    setIsRestoringView(false)
    restoredSectionRef.current = sectionId
    scrollRestoredRef.current = null
  }, [sectionId, chunks.length, blocks?.length, userBook, activeIndex])

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
    if (!sectionId || !parentRef.current) {
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

  const gridClass = isTocOpen
    ? 'lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10'
    : 'lg:grid-cols-1'
  const shellWidthClass = isTocOpen ? 'max-w-6xl' : 'max-w-7xl lg:pr-16'
  const contentOrderClass = 'lg:order-1'
  const tocListClass =
    'reader-scroll mt-4 flex max-h-[55vh] flex-col gap-2 overflow-auto pr-2'

  const tabControls = (
    <div className="mt-4 flex gap-2">
      {tabItems.map((tab) => (
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
  )

  const sidebarPanels = (
    <>
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
          <div className={tocListClass} ref={tocListRef}>
            {sections.map((section, index) => {
              const isActive = section._id === sectionId
              return (
                <button
                  key={section._id}
                  data-section-id={section._id}
                  className={`reader-panel-item rounded-2xl px-3 py-3 text-left text-sm transition ${
                    isActive ? 'is-active' : ''
                  }`}
                  onClick={() => {
                    setActiveSectionId(section._id)
                  }}
                  disabled={isActive}
                >
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
            <div className="reader-scroll mt-4 flex max-h-[50vh] flex-col gap-2 overflow-auto">
              {searchMatches.map((match) => (
                <button
                  key={`${match.index}-${match.snippet}`}
                  className="reader-panel-card rounded-2xl p-3 text-left text-xs hover:border-[rgba(209,161,92,0.4)]"
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
            <p className="text-sm text-[var(--muted)]">Loading bookmarks...</p>
          ) : bookmarks.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No bookmarks yet.</p>
          ) : (
            <div className="reader-scroll flex max-h-[50vh] flex-col gap-3 overflow-auto">
              {bookmarks.map((bookmark) => {
                const sectionTitle =
                  sectionTitleById.get(bookmark.sectionId) ?? 'Untitled chapter'
                const label = bookmark.label?.trim()
                const title = label || sectionTitle
                return (
                  <div
                    key={bookmark._id}
                    role="button"
                    tabIndex={0}
                    className="reader-panel-card relative cursor-pointer rounded-2xl p-3 pr-10 text-xs transition hover:border-white/30"
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
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        if (bookmark.sectionId !== sectionId) {
                          pendingScrollRef.current = bookmark.offset
                          setActiveSectionId(bookmark.sectionId)
                          return
                        }
                        scrollToChunk(bookmark.chunkIndex)
                        if (parentRef.current) {
                          parentRef.current.scrollTop = bookmark.offset
                        }
                      }
                    }}
                  >
                    <div className="text-[var(--ink)]">{title}</div>
                    {label ? (
                      <div className="mt-1 text-sm text-[var(--muted)]">
                        {sectionTitle}
                      </div>
                    ) : null}
                    {(() => {
                      const chapterIndex = sections
                        ? sections.findIndex(
                            (section) => section._id === bookmark.sectionId,
                          )
                        : -1
                      return (
                        <div className="mt-1 text-[10px] uppercase tracking-[0.3em] text-[var(--muted-2)]">
                          {chapterIndex >= 0 ? `Chapter ${chapterIndex + 1}` : 'Chapter'}
                        </div>
                      )
                    })()}
                    <button
                      className="absolute bottom-3 right-3 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-[var(--muted-2)] transition hover:border-rose-500/40 hover:text-rose-300"
                      onClick={(event) => {
                        event.stopPropagation()
                        void deleteBookmark({
                          bookmarkId: bookmark._id,
                        })
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

  const renderSidebar = () => (
    <aside
      className={`surface relative fixed right-6 top-28 z-40 h-[70vh] w-[82vw] max-w-sm overflow-hidden rounded-[24px] p-5 pl-12 transition-transform lg:static lg:order-2 lg:top-auto lg:h-auto lg:w-auto lg:justify-self-end ${
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
      {tabControls}
      {sidebarPanels}
    </aside>
  )

  return (
    <RequireAuth>
      <div className="min-h-screen px-4 pb-16 pt-10 sm:px-6">
        <div className={`mx-auto w-full ${shellWidthClass}`}>
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

          <div className={`relative mt-8 grid gap-6 ${gridClass}`}>
            <div
              className={`fixed inset-0 z-30 bg-black/40 transition-opacity lg:hidden ${
                isTocOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
              onClick={() => setIsTocOpen(false)}
            />

            {renderSidebar()}

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
                {tabItems.map((tab) => (
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
                    {tab.icon}
                  </button>
                ))}
              </div>
            ) : null}

            <section
              className={`card relative overflow-hidden ${themeClass} text-[var(--reader-ink)] ${contentOrderClass}`}
            >
              {userBook === undefined && sectionId ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <div className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-[var(--reader-muted)]">
                    Restoring
                  </div>
                </div>
              ) : null}
              {showLoadingOverlay ? (
                <div className="pointer-events-none absolute right-6 top-6 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--reader-muted)]">
                  Loading chapter
                </div>
              ) : null}
              {!isHydrated || isRestoringView ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
                  <div className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-[var(--reader-muted)]">
                    {isHydrated ? 'Restoring position' : 'Preparing reader'}
                  </div>
                </div>
              ) : null}
              {userBook === undefined && sectionId ? (
                <div className="p-6 text-sm text-[var(--reader-muted)]">
                  Restoring your place…
                </div>
              ) : (
                <div
                  className={`reader-scroll-shell ${
                    !isHydrated || isRestoringView ? 'is-restoring' : ''
                  }`}
                >
                  <div
                    ref={parentRef}
                    className="reader-scroll h-full overflow-auto px-6 py-8 text-left"
                    style={{
                      fontSize: `${fontSize}px`,
                      lineHeight: lineHeight,
                    }}
                  >
                    <div className="mb-6">
                      {!blocks || blocks.length === 0 ? (
                        <h1 className="text-2xl text-[var(--reader-ink)]">
                          {activeSection?.title ?? 'Untitled chapter'}
                        </h1>
                      ) : null}
                    </div>
                    <div className="mx-auto" style={{ maxWidth: `${contentWidth}px` }}>
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
                </div>
              )}
            </section>
          </div>
        </div>
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
      />
    </RequireAuth>
  )
}
