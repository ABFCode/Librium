// Port of fallback.go (pure helpers). The two Book-coupled recovery routines
// (deriveTocFromHeadings, fillMissingMetadata) live as methods on Book.
import { Archive } from './container'
import { parseOpf, type OpfData } from './opf'
import { collapseWhitespace } from './xhtml'
import { posixClean } from './util'
import { stableId } from './util'
import type { ManifestItem, SpineItem } from './types'

export function scoreOpf(data: OpfData | null): number {
  if (!data) return -1
  let score = data.spine.length * 1000
  score += data.manifest.size
  if (data.metadata.title) score += 10
  return score
}

/** Port of selectRootfile — pick the OPF with the best score. */
export function selectRootfile(
  archive: Archive,
  rootfiles: string[],
): { path: string; opf: OpfData | null } {
  let bestPath = ''
  let bestData: OpfData | null = null
  let bestScore = -1
  for (const rf of rootfiles) {
    const text = archive.text(rf)
    const data = text === undefined ? null : parseOpf(text)
    const score = scoreOpf(data)
    if (score > bestScore) {
      bestScore = score
      bestPath = rf
      bestData = data
    }
  }
  return { path: bestPath, opf: bestData }
}

function baseName(p: string): string {
  const i = p.lastIndexOf('/')
  return i === -1 ? p : p.slice(i + 1)
}

export function isHtmlMedia(media: string): boolean {
  const m = media.toLowerCase()
  return m.includes('xhtml') || m.includes('html')
}

/** Port of fallbackManifestFromArchive — infer a manifest from *.x?html files. */
export function fallbackManifestFromArchive(archive: Archive): Map<string, ManifestItem> {
  const items = new Map<string, ManifestItem>()
  const paths = archive.names
    .filter((n) => {
      const l = n.toLowerCase()
      return l.endsWith('.xhtml') || l.endsWith('.html') || l.endsWith('.htm')
    })
    .sort()
  for (const p of paths) {
    const clean = posixClean(p.replace(/^\//, ''))
    const id = 'item_' + stableId(clean)
    items.set(id, {
      id,
      href: baseName(clean),
      mediaType: 'application/xhtml+xml',
      properties: [],
      path: clean,
    })
  }
  return items
}

/** Port of fallbackSpineFromManifest — build a spine from HTML manifest items. */
export function fallbackSpineFromManifest(manifest: Map<string, ManifestItem>): SpineItem[] {
  const items = [...manifest.values()]
    .filter((item) => isHtmlMedia(item.mediaType))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return items.map((item) => ({ idRef: item.id, href: item.path, linear: true, properties: [] }))
}

/** Port of scanXHTMLForFallbacks — first <title>, first heading, first <img src>. */
export function scanXhtmlForFallbacks(doc: Document): { title: string; heading: string; img: string } {
  const titleEl = doc.querySelector('title')
  const headingEl = doc.querySelector('h1,h2,h3,h4,h5,h6')
  const imgEl = doc.querySelector('img')
  return {
    title: collapseWhitespace(titleEl?.textContent ?? ''),
    heading: collapseWhitespace(headingEl?.textContent ?? ''),
    img: (imgEl?.getAttribute('src') ?? '').trim(),
  }
}
