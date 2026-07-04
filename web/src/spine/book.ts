// Port of book.go + content.go + parse.go orchestration, including fallback recovery.
import { Archive, parseContainer, findOpfs } from './container'
import { parseOpf, resolveCover, emptyMetadata, type OpfData } from './opf'
import { resolveTocPath, parseToc, assignTocIds } from './toc'
import { chunkBlocks, resolveTocAnchors, blockToText, DEFAULT_TEXT_OPTIONS } from './chunk'
import { parseXhtmlBlocks } from './xhtml'
import { parseHtml } from './dom'
import {
  posixDir,
  resolvePath,
  contentTypeFromHref,
  splitHrefAnchor,
  anchorKey,
} from './util'
import {
  selectRootfile,
  fallbackManifestFromArchive,
  fallbackSpineFromManifest,
  scanXhtmlForFallbacks,
} from './fallback'
import { ErrNoRootfile, ErrNoSpine } from './errors'
import type {
  AnchorRef,
  Block,
  Chunk,
  ChunkingOptions,
  Cover,
  ManifestItem,
  Metadata,
  SpineItem,
  TOCItem,
  Warning,
} from './types'

export interface FallbackPolicy {
  scanArchive: boolean
  inferSpine: boolean
  generateTOC: boolean
  generateMetadata: boolean
}

export interface Config {
  chunking: ChunkingOptions
  rootfilePath?: string
  fallbacks: FallbackPolicy
}

const DEFAULT_FALLBACKS: FallbackPolicy = {
  scanArchive: true,
  inferSpine: true,
  generateTOC: true,
  generateMetadata: true,
}

const DEFAULT_CONFIG: Config = {
  chunking: { mode: 'paragraph', maxChars: 4000 },
  fallbacks: DEFAULT_FALLBACKS,
}

export class Book {
  metadata: Metadata = emptyMetadata()
  toc: TOCItem[] = []
  landmarks: TOCItem[] = []
  pageList: TOCItem[] = []
  manifest: Map<string, ManifestItem> = new Map()
  spine: SpineItem[] = []
  warnings: Warning[] = []
  anchors = new Map<string, AnchorRef>()
  rootfilePath = ''
  basePath = ''
  private anchorsById = new Map<string, AnchorRef>()
  private archive: Archive
  private cfg: Config
  private chunksCache: Chunk[] | null = null
  private blockCache = new Map<string, Block[]>()

  constructor(archive: Archive, cfg: Config) {
    this.archive = archive
    this.cfg = cfg
  }

  warn(code: string, message: string, path = ''): void {
    this.warnings.push({ code, message, path })
  }

  private cleanHref(href: string): string {
    return splitHrefAnchor(href)[0]
  }

  openResource(href: string): Uint8Array | undefined {
    if (!href) return undefined
    return this.archive.bytes(this.cleanHref(href))
  }

  documentFor(href: string): Document | undefined {
    const text = this.archive.text(this.cleanHref(href))
    return text === undefined ? undefined : parseHtml(text)
  }

  blocks(spineIndex: number): Block[] {
    if (spineIndex < 0 || spineIndex >= this.spine.length) return []
    return this.blocksByHref(this.spine[spineIndex].href)
  }

  blocksByHref(href: string): Block[] {
    const clean = this.cleanHref(href)
    if (!clean) return []
    const cached = this.blockCache.get(clean)
    if (cached) return cached
    const text = this.archive.text(clean)
    if (text === undefined) {
      this.warn('content', 'spine document not found', clean)
      return []
    }
    const blocks = parseXhtmlBlocks(parseHtml(text))
    this.blockCache.set(clean, blocks)
    return blocks
  }

  cover(): Cover | undefined {
    const href = this.metadata.coverHref
    if (!href) return undefined
    const bytes = this.openResource(href)
    if (!bytes) return undefined
    const item = this.manifestItemByPath(href)
    const contentType = item?.mediaType || contentTypeFromHref(href)
    return { href, contentType, bytes }
  }

  private manifestItemByPath(href: string): ManifestItem | undefined {
    for (const item of this.manifest.values()) {
      if (item.path === href || item.href === href) return item
    }
    return undefined
  }

  chunks(opts?: ChunkingOptions): Chunk[] {
    if (this.chunksCache) return this.chunksCache
    const chunkOpts = opts ?? this.cfg.chunking
    const out: Chunk[] = []
    const anchorMap = new Map<string, AnchorRef>()
    const anchorById = new Map<string, AnchorRef>()
    let chunkIndex = 0
    for (let spineIndex = 0; spineIndex < this.spine.length; spineIndex++) {
      const item = this.spine[spineIndex]
      if (!item.href) {
        this.warn('spine', 'missing href for spine item')
        continue
      }
      const blocks = this.blocksByHref(item.href)
      chunkIndex = chunkBlocks(
        blocks,
        item.href,
        spineIndex,
        chunkIndex,
        chunkOpts,
        DEFAULT_TEXT_OPTIONS,
        anchorMap,
        anchorById,
        (c) => out.push(c),
      )
    }
    this.anchors = anchorMap
    this.anchorsById = anchorById
    resolveTocAnchors(this.toc, anchorMap, anchorById)
    resolveTocAnchors(this.landmarks, anchorMap, anchorById)
    resolveTocAnchors(this.pageList, anchorMap, anchorById)
    this.chunksCache = out
    return out
  }

  resolveAnchor(href: string): AnchorRef | undefined {
    if (href.includes('#')) {
      const direct = this.anchors.get(href)
      if (direct) return direct
      const frag = href.split('#', 2)[1]
      if (frag !== undefined) return this.anchorsById.get(frag)
      return undefined
    }
    return this.anchors.get(href) ?? this.anchorsById.get(href)
  }

  /** Port of deriveTOCFromHeadings — build a TOC from heading blocks. */
  deriveTocFromHeadings(): TOCItem[] {
    const toc: TOCItem[] = []
    const stack: { level: number; items: TOCItem[] }[] = [{ level: 0, items: toc }]
    for (const item of this.spine) {
      if (!item.href) continue
      const blocks = this.blocksByHref(item.href)
      for (const block of blocks) {
        if (block.kind !== 'heading') continue
        let label = blockToText(block, DEFAULT_TEXT_OPTIONS)
        if (!label) label = 'Untitled'
        let level = block.level ?? 0
        if (level <= 0) level = 1
        while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop()
        const parent = stack[stack.length - 1].items
        let href = item.href
        if (block.anchors && block.anchors.length > 0) href = anchorKey(item.href, block.anchors[0])
        const newItem: TOCItem = { id: '', label, href, children: [] }
        parent.push(newItem)
        stack.push({ level, items: newItem.children })
      }
    }
    assignTocIds(toc, [])
    return toc
  }

  /** Port of fillMissingMetadata. */
  fillMissingMetadata(): void {
    if (this.metadata.title && this.metadata.coverHref) return
    if (this.spine.length === 0 || !this.spine[0].href) return
    const doc = this.documentFor(this.spine[0].href)
    if (!doc) return
    const { title, heading, img } = scanXhtmlForFallbacks(doc)
    if (!this.metadata.title) {
      if (title) this.metadata.title = title
      else if (heading) this.metadata.title = heading
      else {
        this.metadata.title = 'Unknown'
        this.warn('metadata', 'missing title', this.spine[0].href)
      }
    }
    if (this.metadata.title && this.metadata.titles.length === 0) {
      this.metadata.titles.push({
        id: '',
        value: this.metadata.title,
        language: '',
        scheme: '',
        fileAs: '',
        role: '',
        displaySeq: 0,
        refinements: {},
      })
    }
    if (!this.metadata.coverHref && img) {
      this.metadata.coverHref = resolvePath(posixDir(this.spine[0].href), img)
    }
  }
}

function mergeConfig(opts?: Partial<Config>): Config {
  return {
    chunking: opts?.chunking ?? DEFAULT_CONFIG.chunking,
    rootfilePath: opts?.rootfilePath,
    fallbacks: { ...DEFAULT_FALLBACKS, ...opts?.fallbacks },
  }
}

/** Port of parse.go's openWithConfig — parse an EPUB from bytes into a Book. */
export function parse(bytes: Uint8Array, opts?: Partial<Config>): Book {
  const cfg = mergeConfig(opts)
  const archive = new Archive(bytes)
  const book = new Book(archive, cfg)

  let rootfiles: string[] = []
  try {
    rootfiles = parseContainer(archive)
  } catch (e) {
    book.warn('container', String(e), 'META-INF/container.xml')
    if (cfg.fallbacks.scanArchive) rootfiles = findOpfs(archive)
    else throw e
  }

  let rootfilePath = cfg.rootfilePath || ''
  let opf: OpfData | null = null
  if (!rootfilePath && rootfiles.length > 0) {
    if (rootfiles.length > 1) {
      const sel = selectRootfile(archive, rootfiles)
      rootfilePath = sel.path || rootfiles[0]
      opf = sel.opf
    } else {
      rootfilePath = rootfiles[0]
    }
  }
  if (rootfilePath && !opf) {
    const text = archive.text(rootfilePath)
    opf = text === undefined ? null : parseOpf(text)
  }

  // No rootfile at all: scan-archive fallback.
  if (!rootfilePath && rootfiles.length === 0) {
    if (!cfg.fallbacks.scanArchive) throw ErrNoRootfile
    book.warn('container', 'no rootfile found; scanning archive', '')
    book.manifest = fallbackManifestFromArchive(archive)
    if (cfg.fallbacks.inferSpine) book.spine = fallbackSpineFromManifest(book.manifest)
    if (book.spine.length === 0) throw ErrNoSpine
    if (cfg.fallbacks.generateMetadata) book.fillMissingMetadata()
    if (cfg.fallbacks.generateTOC) book.toc = book.deriveTocFromHeadings()
    return book
  }

  if (!opf) {
    opf = { metadata: emptyMetadata(), manifest: new Map(), spine: [], spineToc: '', coverId: '', version: '' }
  }

  book.rootfilePath = rootfilePath
  book.basePath = posixDir(rootfilePath)
  book.metadata = opf.metadata
  book.manifest = opf.manifest
  book.spine = opf.spine

  for (const [id, item] of book.manifest) {
    if (!item.path) item.path = resolvePath(book.basePath, item.href)
    book.manifest.set(id, item)
  }
  for (const s of book.spine) {
    if (!s.href && s.idRef) s.href = book.manifest.get(s.idRef)?.path ?? ''
  }

  if (book.manifest.size === 0 && cfg.fallbacks.scanArchive) {
    book.manifest = fallbackManifestFromArchive(archive)
  }
  if (book.spine.length === 0 && cfg.fallbacks.inferSpine) {
    book.spine = fallbackSpineFromManifest(book.manifest)
  }

  const cover = resolveCover(book.manifest, opf.coverId)
  if (cover) book.metadata.coverHref = cover
  if (cfg.fallbacks.generateMetadata) book.fillMissingMetadata()

  const tocPath = resolveTocPath(book.manifest, opf.spineToc)
  if (tocPath) {
    try {
      const nav = parseToc(archive, tocPath)
      book.toc = nav.toc
      book.landmarks = nav.landmarks
      book.pageList = nav.pageList
    } catch (e) {
      book.warn('toc', String(e), tocPath)
    }
  }
  if (book.toc.length === 0 && cfg.fallbacks.generateTOC) {
    book.toc = book.deriveTocFromHeadings()
  }

  return book
}
