// Faithful port of xhtml.go's parseXHTMLBlocks. Spine drives a state machine off
// a streaming HTML tokenizer; we drive the SAME state machine off a DOM pre-order
// walk that emits start/text/end events in document order (token-equivalent).
import type { Block, Inline, Table, TableRow, TableCell, Figure, BlockKind } from './types'

/** Collapse the 5 ASCII whitespace chars to single spaces + trim (matches Go collapseWhitespace). */
export function collapseWhitespace(s: string): string {
  return s.replace(/[\t\n\r\f ]+/g, ' ').trim()
}

function atoiSafe(v: string): number {
  let n = 0
  for (const ch of v.trim()) {
    if (ch < '0' || ch > '9') return n
    n = n * 10 + (ch.charCodeAt(0) - 48)
  }
  return n
}

interface ListState {
  ordered: boolean
  index: number
}

export function parseXhtmlBlocks(doc: Document): Block[] {
  const blocks: Block[] = []
  let cur: Block | null = null
  let pendingAnchors: string[] = []
  const listStack: ListState[] = []
  let listDepth = 0
  let emphDepth = 0
  let strongDepth = 0
  const linkStack: string[] = []
  let skipDepth = 0
  let blockQuoteDepth = 0
  let preDepth = 0
  let codeDepth = 0
  let tableDepth = 0
  let currentTable: Table | null = null
  let currentRow: TableRow | null = null
  let currentCell: TableCell | null = null
  let currentFigure: Figure | null = null
  let inFigcaption = false

  const flush = () => {
    if (!cur) return
    const empty =
      (!cur.inlines || cur.inlines.length === 0) &&
      (!cur.anchors || cur.anchors.length === 0) &&
      !cur.table &&
      !cur.figure
    if (empty) {
      cur = null
      return
    }
    blocks.push(cur)
    cur = null
  }

  const ensureBlock = (kind: BlockKind, level: number) => {
    if (!cur || cur.kind !== kind || (kind === 'heading' && (cur.level ?? 0) !== level)) {
      flush()
      cur = { kind, inlines: [], anchors: [] }
      if (kind === 'heading') cur.level = level
      if (pendingAnchors.length > 0) {
        cur.anchors!.push(...pendingAnchors)
        pendingAnchors = []
      }
    }
  }

  const addAnchor = (id: string) => {
    if (!id) return
    if (cur) cur.anchors!.push(id)
    else pendingAnchors.push(id)
  }

  const addInline = (inline: Inline) => {
    if (currentCell) {
      currentCell.inlines.push(inline)
      return
    }
    if (currentFigure) {
      if (inline.kind === 'image' && !inFigcaption) currentFigure.images.push(inline)
      else currentFigure.caption.push(inline)
      return
    }
    if (cur) cur.inlines!.push(inline)
  }

  const addInlineText = (text: string, preserve: boolean) => {
    const clean = preserve ? text : collapseWhitespace(text)
    if (clean.trim() === '') return
    let kind: Inline['kind'] = 'text'
    if (emphDepth > 0) kind = 'emphasis'
    if (strongDepth > 0) kind = 'strong'
    if (codeDepth > 0) kind = 'code'
    const inline: Inline = { kind, text: clean, emph: emphDepth > 0, strong: strongDepth > 0 }
    if (linkStack.length > 0) {
      inline.kind = 'link'
      inline.href = linkStack[linkStack.length - 1]
    }
    addInline(inline)
  }

  const onStart = (tag: string, attrs: Record<string, string>) => {
    if (tag === 'script' || tag === 'style' || tag === 'head' || tag === 'noscript') {
      skipDepth++
      return
    }
    if (skipDepth > 0) return

    if (attrs['id']) addAnchor(attrs['id'])
    if (attrs['name']) addAnchor(attrs['name'])

    switch (tag) {
      case 'p':
        if (blockQuoteDepth > 0) ensureBlock('blockquote', blockQuoteDepth)
        else ensureBlock('paragraph', 0)
        break
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        ensureBlock('heading', Number(tag[1]))
        break
      case 'li':
        if (listStack.length > 0) listStack[listStack.length - 1].index++
        ensureBlock('list_item', listDepth)
        if (cur && listStack.length > 0) {
          cur.ordered = listStack[listStack.length - 1].ordered
          cur.listIndex = listStack[listStack.length - 1].index
        }
        break
      case 'ul':
      case 'ol': {
        const ordered = tag === 'ol'
        let start = 1
        if (ordered && attrs['start']) {
          start = atoiSafe(attrs['start'])
          if (start <= 0) start = 1
        }
        listStack.push({ ordered, index: start - 1 })
        listDepth = listStack.length
        break
      }
      case 'br':
        if (!cur) ensureBlock('paragraph', 0)
        addInline({ kind: 'text', text: '\n' })
        break
      case 'img':
        if (!cur) ensureBlock('paragraph', 0)
        addInline({ kind: 'image', src: attrs['src'] ?? '', alt: attrs['alt'] ?? '' })
        break
      case 'a':
        if (attrs['href']) linkStack.push(attrs['href'])
        break
      case 'em':
      case 'i':
        emphDepth++
        break
      case 'strong':
      case 'b':
        strongDepth++
        break
      case 'blockquote':
        blockQuoteDepth++
        break
      case 'pre':
        preDepth++
        ensureBlock('pre', 0)
        break
      case 'code':
        codeDepth++
        if (!cur) ensureBlock('paragraph', 0)
        break
      case 'hr':
        flush()
        blocks.push({ kind: 'hr' })
        break
      case 'table':
        tableDepth++
        ensureBlock('table', 0)
        if (!cur!.table) cur!.table = { rows: [] }
        currentTable = cur!.table
        break
      case 'tr':
        if (tableDepth > 0 && currentTable) {
          const row: TableRow = { cells: [] }
          currentTable.rows.push(row)
          currentRow = row
          currentCell = null
        }
        break
      case 'td':
      case 'th':
        if (tableDepth > 0 && currentTable) {
          if (!currentRow) {
            const row: TableRow = { cells: [] }
            currentTable.rows.push(row)
            currentRow = row
          }
          const cell: TableCell = { inlines: [], header: tag === 'th' }
          currentRow.cells.push(cell)
          currentCell = cell
        }
        break
      case 'figure':
        ensureBlock('figure', 0)
        if (!cur!.figure) cur!.figure = { images: [], caption: [] }
        currentFigure = cur!.figure
        break
      case 'figcaption':
        if (!cur || cur.kind !== 'figure') {
          ensureBlock('figure', 0)
          if (!cur!.figure) cur!.figure = { images: [], caption: [] }
        }
        currentFigure = cur!.figure!
        inFigcaption = true
        break
    }
  }

  const onEnd = (tag: string) => {
    if (tag === 'script' || tag === 'style' || tag === 'head' || tag === 'noscript') {
      if (skipDepth > 0) skipDepth--
      return
    }
    if (skipDepth > 0) return
    switch (tag) {
      case 'p':
      case 'li':
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        flush()
        break
      case 'ul':
      case 'ol':
        if (listStack.length > 0) listStack.pop()
        listDepth = listStack.length
        break
      case 'a':
        if (linkStack.length > 0) linkStack.pop()
        break
      case 'em':
      case 'i':
        if (emphDepth > 0) emphDepth--
        break
      case 'strong':
      case 'b':
        if (strongDepth > 0) strongDepth--
        break
      case 'blockquote':
        if (blockQuoteDepth > 0) blockQuoteDepth--
        if (cur && cur.kind === 'blockquote') flush()
        break
      case 'pre':
        if (preDepth > 0) preDepth--
        if (cur && cur.kind === 'pre') flush()
        break
      case 'code':
        if (codeDepth > 0) codeDepth--
        break
      case 'table':
        if (tableDepth > 0) tableDepth--
        if (cur && cur.kind === 'table') flush()
        currentTable = null
        currentRow = null
        currentCell = null
        break
      case 'td':
      case 'th':
        currentCell = null
        break
      case 'tr':
        currentRow = null
        break
      case 'figure':
        if (cur && cur.kind === 'figure') flush()
        currentFigure = null
        inFigcaption = false
        break
      case 'figcaption':
        inFigcaption = false
        break
    }
  }

  const onText = (raw: string) => {
    if (skipDepth > 0) return
    if (preDepth === 0 && collapseWhitespace(raw) === '') return
    if (!cur) {
      if (blockQuoteDepth > 0) ensureBlock('blockquote', blockQuoteDepth)
      else ensureBlock('paragraph', 0)
    }
    addInlineText(raw, preDepth > 0)
  }

  // Pre-order DOM walk emitting token-equivalent events.
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        onText((child as Text).data)
      } else if (child.nodeType === 1) {
        const el = child as Element
        const tag = el.tagName.toLowerCase()
        const attrs: Record<string, string> = {}
        for (const a of Array.from(el.attributes)) attrs[a.name.toLowerCase()] = a.value
        onStart(tag, attrs)
        walk(el)
        onEnd(tag)
      }
    }
  }

  walk(doc.documentElement)
  flush()
  return blocks
}
