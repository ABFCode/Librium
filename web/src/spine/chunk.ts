// Port of chunk.go — chunk generation, block→text, and anchor-map building.
// Librium always uses Spine's default text options, so those are inlined here
// rather than plumbed through ChunkingOptions.
import { anchorKey, stableId } from './util'
import type { AnchorRef, Block, ChunkingOptions, Chunk, Inline, Figure, Table, TOCItem } from './types'

interface TextOptions {
  preserveLineBreaks: boolean
  includeHeadings: boolean
  headingMarkers: boolean
  includeListMarkers: boolean
  includeHorizontalRules: boolean
}

export const DEFAULT_TEXT_OPTIONS: TextOptions = {
  preserveLineBreaks: true,
  includeHeadings: true,
  headingMarkers: false,
  includeListMarkers: true,
  includeHorizontalRules: true,
}

const encoder = new TextEncoder()
const byteLen = (s: string): number => encoder.encode(s).length

function inlineToText(inline: Inline, opts: TextOptions): string {
  if (inline.kind === 'image') return inline.alt ? inline.alt : '[image]'
  if (inline.text === '\n' && !opts.preserveLineBreaks) return ' '
  return inline.text ?? ''
}

function inlinesToText(inlines: Inline[], opts: TextOptions): string {
  let s = ''
  for (const inline of inlines) {
    s += inlineToText(inline, opts)
    if (!s.endsWith(' ')) s += ' '
  }
  return s.trim()
}

function tableToText(table: Table, opts: TextOptions): string {
  const rows = table.rows.map((row) => row.cells.map((c) => inlinesToText(c.inlines, opts)).join('\t'))
  return rows.join('\n').trim()
}

function figureToText(fig: Figure, opts: TextOptions): string {
  const caption = inlinesToText(fig.caption, opts)
  if (caption) return caption
  return fig.images.map((img) => inlineToText(img, opts)).join(' ').trim()
}

/** Port of blockToText (Spine's internal text extraction). */
export function blockToText(block: Block, opts: TextOptions = DEFAULT_TEXT_OPTIONS): string {
  if (block.table) return tableToText(block.table, opts)
  if (block.figure) return figureToText(block.figure, opts)
  if (block.kind === 'heading' && !opts.includeHeadings) return ''
  const inlines = block.inlines ?? []
  if (block.kind === 'pre' || block.kind === 'table') {
    let s = ''
    for (const inline of inlines) s += inline.kind === 'image' ? inlineToText(inline, opts) : inline.text ?? ''
    return s.replace(/[ \n\t]+$/, '')
  }
  let prefix = ''
  if (block.kind === 'list_item' && opts.includeListMarkers) {
    prefix = block.ordered && (block.listIndex ?? 0) > 0 ? `${block.listIndex}. ` : '- '
  }
  if (block.kind === 'hr') return opts.includeHorizontalRules ? '---' : ''
  if (block.kind === 'heading' && opts.headingMarkers) {
    let level = block.level ?? 1
    level = level <= 0 ? 1 : level > 6 ? 6 : level
    prefix = '#'.repeat(level) + ' '
  }
  let s = prefix
  for (const inline of inlines) {
    s += inlineToText(inline, opts)
    if (!s.endsWith(' ') && !s.endsWith('\n')) s += ' '
  }
  return s.trim()
}

/** Port of chunkBlocks. Emits chunks; returns the next chunkIndex. */
export function chunkBlocks(
  blocks: Block[],
  href: string,
  spineIndex: number,
  chunkStart: number,
  opts: ChunkingOptions,
  textOpts: TextOptions,
  anchorMap: Map<string, AnchorRef>,
  anchorByID: Map<string, AnchorRef>,
  emit: (c: Chunk) => void,
): number {
  let current: Chunk | null = null
  let chunkIndex = chunkStart
  let textLen = 0
  let offset = 0

  const flush = () => {
    if (!current) return
    current.text = current.text.trim()
    emit(current)
    offset += textLen
    current = null
    textLen = 0
  }

  const startChunk = (blockIndex: number) => {
    current = {
      id: stableId(href, String(spineIndex), String(chunkIndex)),
      text: '',
      href,
      spineIndex,
      blockIndexFrom: blockIndex,
      blockIndexTo: blockIndex,
      startOffset: offset,
      endOffset: offset,
      anchors: [],
      blocks: [],
    }
    chunkIndex++
    textLen = 0
  }

  const appendBlock = (block: Block, blockIndex: number, blockText: string) => {
    if (!current) startChunk(blockIndex)
    const c = current!
    if (blockText !== '' && c.text !== '') {
      c.text += '\n\n'
      textLen += 2
    }
    if (blockText !== '') {
      c.text += blockText
      textLen += byteLen(blockText)
    }
    c.blockIndexTo = blockIndex
    c.endOffset = offset + textLen
    c.blocks.push(block)
    if (block.anchors && block.anchors.length > 0) {
      c.anchors.push(...block.anchors)
      for (const id of block.anchors) {
        const ref: AnchorRef = {
          spineIndex,
          blockIndex,
          chunkId: c.id,
          offset: offset + textLen - byteLen(blockText),
          href: href + '#' + id,
        }
        const key = anchorKey(href, id)
        if (!anchorMap.has(key)) anchorMap.set(key, ref)
        if (!anchorByID.has(id)) anchorByID.set(id, ref)
      }
    }
  }

  blocks.forEach((block, i) => {
    const text = blockToText(block, textOpts)
    const blockLen = byteLen(text)
    if (opts.mode === 'size') {
      if (textLen > 0 && textLen + blockLen > opts.maxChars) flush()
      appendBlock(block, i, text)
    } else if (opts.mode === 'paragraph') {
      appendBlock(block, i, text)
      if (blockLen > 0) flush()
    } else {
      appendBlock(block, i, text)
    }
  })
  flush()
  return chunkIndex
}

function splitFragment(href: string): [string, string] {
  const i = href.indexOf('#')
  return i === -1 ? [href, ''] : [href.slice(0, i), href.slice(i + 1)]
}

/** Port of resolveTOCAnchors — fills TOCItem.target from the anchor maps. */
export function resolveTocAnchors(
  items: TOCItem[],
  anchors: Map<string, AnchorRef>,
  anchorsByID: Map<string, AnchorRef>,
): void {
  for (const item of items) {
    if (item.href) {
      const [base, frag] = splitFragment(item.href)
      if (frag) {
        if (base.includes('://') || base.startsWith('data:')) {
          // external, skip
        } else {
          const byKey = anchors.get(anchorKey(base, frag))
          const byId = anchorsByID.get(frag)
          if (byKey) {
            item.target = { ...byKey, href: base + '#' + frag }
          } else if (byId) {
            item.target = { ...byId }
          }
        }
      }
    }
    if (item.children.length > 0) resolveTocAnchors(item.children, anchors, anchorsByID)
  }
}
