// Port of toc.go — TOC path resolution, NCX (EPUB2) + nav (EPUB3) parsing,
// TOC id assignment, href resolution, and FlattenTOC.
import { parseXml, parseHtml } from './dom'
import { posixDir, resolvePath, stableId } from './util'
import type { FlatTOCItem, ManifestItem, TOCItem } from './types'
import type { Archive } from './container'

export interface NavData {
  toc: TOCItem[]
  landmarks: TOCItem[]
  pageList: TOCItem[]
}

/** Port of resolveTOCPath. */
export function resolveTocPath(manifest: Map<string, ManifestItem>, spineToc: string): string {
  if (spineToc) {
    const item = manifest.get(spineToc)
    if (item) return item.path
  }
  for (const item of manifest.values()) {
    if (item.properties.includes('nav')) return item.path
  }
  for (const item of manifest.values()) {
    if (
      item.mediaType.toLowerCase() === 'application/x-dtbncx+xml' ||
      item.path.toLowerCase().endsWith('.ncx')
    ) {
      return item.path
    }
  }
  return ''
}

/** Port of Book.parseTOC. */
export function parseToc(archive: Archive, tocPath: string): NavData {
  const data = archive.text(tocPath)
  if (data === undefined) throw new Error('toc not found in archive: ' + tocPath)
  const lower = data.toLowerCase()
  if (lower.includes('<ncx') || tocPath.toLowerCase().endsWith('.ncx')) {
    const items = parseNcx(data)
    assignTocIds(items, [])
    resolveTocHrefs(items, tocPath)
    return { toc: items, landmarks: [], pageList: [] }
  }
  const nav = parseNav(data)
  assignTocIds(nav.toc, [])
  assignTocIds(nav.landmarks, [])
  assignTocIds(nav.pageList, [])
  resolveTocHrefs(nav.toc, tocPath)
  resolveTocHrefs(nav.landmarks, tocPath)
  resolveTocHrefs(nav.pageList, tocPath)
  return nav
}

function childByLocal(parent: Element, local: string): Element | undefined {
  for (const c of Array.from(parent.children)) if (c.localName === local) return c
  return undefined
}
function childrenByLocal(parent: Element, local: string): Element[] {
  return Array.from(parent.children).filter((c) => c.localName === local)
}

function parseNcx(xmlText: string): TOCItem[] {
  const doc = parseXml(xmlText)
  let navMap: Element | undefined
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    if (el.localName === 'navMap') {
      navMap = el
      break
    }
  }
  if (!navMap) return []
  const convert = (points: Element[]): TOCItem[] =>
    points.map((p) => {
      const labelEl = childByLocal(p, 'navLabel')
      const textEl = labelEl ? childByLocal(labelEl, 'text') : undefined
      const label = (textEl?.textContent ?? '').trim()
      const contentEl = childByLocal(p, 'content')
      const src = (contentEl?.getAttribute('src') ?? '').trim()
      return {
        id: (p.getAttribute('id') ?? '').trim(),
        label,
        href: src,
        children: convert(childrenByLocal(p, 'navPoint')),
      }
    })
  return convert(childrenByLocal(navMap, 'navPoint'))
}

type NavKind = 'unknown' | 'toc' | 'landmarks' | 'pageList'

function navTypeFromAttrs(attrs: Record<string, string>): NavKind {
  const epubType = attrs['epub:type']
  if (epubType) {
    for (const part of epubType.toLowerCase().split(/\s+/)) {
      if (part === 'toc') return 'toc'
      if (part === 'landmarks') return 'landmarks'
      if (part === 'page-list') return 'pageList'
    }
  }
  if (attrs['role'] && attrs['role'].toLowerCase() === 'doc-toc') return 'toc'
  return 'unknown'
}

/** Faithful port of parseNav (state machine driven by a DOM pre-order walk). */
function parseNav(htmlText: string): NavData {
  const doc = parseHtml(htmlText)
  const toc: TOCItem[] = []
  const landmarks: TOCItem[] = []
  const pageList: TOCItem[] = []
  let stack: TOCItem[][] = []
  let curItem: TOCItem | null = null
  let inNav = false
  let navType: NavKind = 'unknown'
  let inLink = false
  let linkBuf = ''

  const root = (): TOCItem[] =>
    navType === 'landmarks' ? landmarks : navType === 'pageList' ? pageList : toc

  const onStart = (tag: string, attrs: Record<string, string>) => {
    if (tag === 'nav') {
      navType = navTypeFromAttrs(attrs)
      if (navType !== 'unknown') {
        inNav = true
        stack = [root()]
      }
      return
    }
    if (!inNav) return
    switch (tag) {
      case 'ol':
      case 'ul':
        if (curItem) stack.push(curItem.children)
        else if (stack.length >= 1) stack.push(stack[stack.length - 1])
        break
      case 'li': {
        const list = stack[stack.length - 1]
        const item: TOCItem = { id: '', label: '', href: '', children: [] }
        list.push(item)
        curItem = item
        break
      }
      case 'a':
        if (curItem) {
          curItem.href = attrs['href'] ?? ''
          inLink = true
          linkBuf = ''
        }
        break
    }
  }

  const onEnd = (tag: string) => {
    if (tag === 'nav' && inNav) {
      inNav = false
      curItem = null
      navType = 'unknown'
      stack = []
      return
    }
    if (!inNav) return
    switch (tag) {
      case 'ol':
      case 'ul':
        if (stack.length > 1) stack.pop()
        break
      case 'li':
        curItem = null
        break
      case 'a':
        if (inLink && curItem) {
          curItem.label = linkBuf.trim()
          inLink = false
          linkBuf = ''
        }
        break
    }
  }

  const onText = (t: string) => {
    if (inLink) linkBuf += t
  }

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
  return { toc, landmarks, pageList }
}

function pathToStrings(path: number[]): string[] {
  return path.map((v) => String.fromCharCode(97 + (v % 26)))
}

export function assignTocIds(items: TOCItem[], path: number[]): void {
  items.forEach((item, i) => {
    const idxPath = [...path, i]
    if (!item.id) item.id = stableId(...pathToStrings(idxPath), item.href, item.label)
    if (item.children.length > 0) assignTocIds(item.children, idxPath)
  })
}

function resolveTocHrefs(items: TOCItem[], tocPath: string): void {
  const base = posixDir(tocPath)
  for (const item of items) {
    if (item.href) {
      item.href = item.href.startsWith('#') ? tocPath + item.href : resolvePath(base, item.href)
    }
    if (item.children.length > 0) resolveTocHrefs(item.children, tocPath)
  }
}

/** Port of FlattenTOC. */
export function flattenToc(items: TOCItem[]): FlatTOCItem[] {
  const out: FlatTOCItem[] = []
  const walk = (list: TOCItem[], depth: number, parent: number) => {
    for (const item of list) {
      const idx = out.length
      out.push({
        id: item.id,
        label: item.label,
        href: item.href,
        depth,
        parent,
        target: item.target,
      })
      if (item.children.length > 0) walk(item.children, depth + 1, idx)
    }
  }
  walk(items, 0, -1)
  return out
}
