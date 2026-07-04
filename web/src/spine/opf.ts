// Port of opf.go — OPF (package document) parsing: metadata, manifest, spine,
// cover, EPUB3 refinements/collections. Go used a streaming token decoder; here
// we traverse the DOM, preserving the same semantics.
import { parseXml } from './dom'
import type {
  Collection,
  Identifier,
  ManifestItem,
  Metadata,
  MetaValue,
  SpineItem,
} from './types'

export interface OpfData {
  metadata: Metadata
  manifest: Map<string, ManifestItem>
  spine: SpineItem[]
  spineToc: string
  coverId: string
  version: string
}

export function emptyMetadata(): Metadata {
  return {
    title: '',
    titles: [],
    authors: [],
    creators: [],
    contributors: [],
    language: '',
    languages: [],
    identifiers: [],
    publisher: '',
    publishers: [],
    pubDate: '',
    dates: [],
    series: '',
    seriesIndex: '',
    subjects: [],
    rights: [],
    descriptions: [],
    modified: '',
    collections: [],
    coverHref: '',
  }
}

function attr(el: Element, local: string): string {
  for (const a of Array.from(el.attributes)) {
    if (a.localName === local) return a.value
  }
  return ''
}

function splitProps(s: string): string[] {
  const fields = s.split(/\s+/).filter(Boolean)
  return fields.length ? fields : []
}

function atoiSafe(v: string): number {
  let n = 0
  for (const ch of v.trim()) {
    if (ch < '0' || ch > '9') return n
    n = n * 10 + (ch.charCodeAt(0) - 48)
  }
  return n
}

function childByLocal(parent: Element, local: string): Element | undefined {
  for (const c of Array.from(parent.children)) if (c.localName === local) return c
  return undefined
}

function mkMeta(id: string, value: string, lang = '', fileAs = '', role = ''): MetaValue {
  return { id, value, language: lang, scheme: '', fileAs, role, displaySeq: 0, refinements: {} }
}

/** Port of parseOPF. */
export function parseOpf(xmlText: string): OpfData {
  const doc = parseXml(xmlText)
  const pkg = doc.documentElement
  const meta = emptyMetadata()
  const manifest = new Map<string, ManifestItem>()
  const spine: SpineItem[] = []
  const data: OpfData = { metadata: meta, manifest, spine, spineToc: '', coverId: '', version: '' }

  data.version = (attr(pkg, 'version') || '').trim()

  const refinements = new Map<string, Record<string, string>>()
  const metaTargets = new Map<string, MetaValue[]>()
  const identifierTargets = new Map<string, Identifier>()
  const collectionTargets = new Map<string, Collection>()
  const track = (id: string, mv: MetaValue) => {
    if (!id) return
    const list = metaTargets.get(id) ?? []
    list.push(mv)
    metaTargets.set(id, list)
  }

  // ---- metadata ----
  const metadataEl = childByLocal(pkg, 'metadata')
  if (metadataEl) {
    for (const el of Array.from(metadataEl.children)) {
      const name = el.localName
      const id = attr(el, 'id')
      const lang = attr(el, 'lang')
      const fileAs = attr(el, 'file-as')
      const role = attr(el, 'role')
      const text = (el.textContent ?? '').trim()
      switch (name) {
        case 'title':
          if (text) {
            const mv = mkMeta(id, text, lang, fileAs, role)
            meta.titles.push(mv)
            track(id, mv)
            if (!meta.title) meta.title = text
          }
          break
        case 'creator':
          if (text) {
            const mv = mkMeta(id, text, lang, fileAs, role)
            meta.creators.push(mv)
            track(id, mv)
            meta.authors.push(text)
          }
          break
        case 'contributor':
          if (text) {
            const mv = mkMeta(id, text, lang, fileAs, role)
            meta.contributors.push(mv)
            track(id, mv)
          }
          break
        case 'subject':
          if (text) {
            const mv = mkMeta(id, text, lang)
            meta.subjects.push(mv)
            track(id, mv)
          }
          break
        case 'language':
          if (text) {
            if (!meta.language) meta.language = text
            meta.languages.push(text)
          }
          break
        case 'identifier':
          if (text) {
            const ident: Identifier = { id, scheme: attr(el, 'scheme'), value: text, type: '' }
            meta.identifiers.push(ident)
            if (id) identifierTargets.set(id, ident)
          }
          break
        case 'publisher':
          if (text) {
            const mv = mkMeta(id, text, lang)
            meta.publishers.push(mv)
            track(id, mv)
            if (!meta.publisher) meta.publisher = text
          }
          break
        case 'date':
          if (text) {
            const mv = mkMeta(id, text, lang)
            meta.dates.push(mv)
            track(id, mv)
            if (!meta.pubDate) meta.pubDate = text
          }
          break
        case 'description':
          if (text) {
            const mv = mkMeta(id, text, lang)
            meta.descriptions.push(mv)
            track(id, mv)
          }
          break
        case 'rights':
          if (text) {
            const mv = mkMeta(id, text, lang)
            meta.rights.push(mv)
            track(id, mv)
          }
          break
        case 'meta': {
          const nameAttr = attr(el, 'name')
          const content = attr(el, 'content')
          const property = attr(el, 'property')
          const refines = attr(el, 'refines').replace(/^#/, '')
          const idAttr = attr(el, 'id')
          if (nameAttr.toLowerCase() === 'cover' && content) data.coverId = content
          if (property.endsWith('belongs-to-collection')) {
            if (text) {
              const col: Collection = { id: idAttr, name: text, type: '', position: '' }
              meta.collections.push(col)
              if (idAttr) collectionTargets.set(idAttr, col)
              if (!meta.series) meta.series = text
            }
            break
          }
          if (property.endsWith('modified')) {
            if (text) meta.modified = text
            break
          }
          if (property && refines) {
            if (text) {
              const r = refinements.get(refines) ?? {}
              r[property] = text
              refinements.set(refines, r)
            }
          }
          break
        }
      }
    }
  }

  // ---- manifest ----
  const manifestEl = childByLocal(pkg, 'manifest')
  if (manifestEl) {
    for (const el of Array.from(manifestEl.children)) {
      if (el.localName !== 'item') continue
      const item: ManifestItem = {
        id: attr(el, 'id'),
        href: attr(el, 'href'),
        mediaType: attr(el, 'media-type'),
        properties: splitProps(attr(el, 'properties')),
        path: '',
      }
      if (item.id) manifest.set(item.id, item)
    }
  }

  // ---- spine ----
  const spineEl = childByLocal(pkg, 'spine')
  if (spineEl) {
    data.spineToc = attr(spineEl, 'toc')
    for (const el of Array.from(spineEl.children)) {
      if (el.localName !== 'itemref') continue
      const item: SpineItem = {
        idRef: attr(el, 'idref'),
        href: '',
        linear: attr(el, 'linear').toLowerCase() !== 'no',
        properties: splitProps(attr(el, 'properties')),
      }
      if (item.idRef) spine.push(item)
    }
  }

  applyRefinements(metaTargets, identifierTargets, collectionTargets, refinements, meta)
  return data
}

function applyRefinements(
  metaTargets: Map<string, MetaValue[]>,
  identifierTargets: Map<string, Identifier>,
  collectionTargets: Map<string, Collection>,
  refinements: Map<string, Record<string, string>>,
  meta: Metadata,
): void {
  for (const [id, props] of refinements) {
    const targets = metaTargets.get(id)
    if (targets) for (const mv of targets) applyMetaProps(mv, props)
    const ident = identifierTargets.get(id)
    if (ident && props['identifier-type']) ident.type = props['identifier-type']
    const col = collectionTargets.get(id)
    if (col) {
      if (props['collection-type']) col.type = props['collection-type']
      if (props['group-position']) {
        col.position = props['group-position']
        if (!meta.seriesIndex) meta.seriesIndex = props['group-position']
      }
    }
  }
  for (const col of meta.collections) {
    if (col.type === 'series' && !meta.series) meta.series = col.name
    if (col.type === 'series' && !meta.seriesIndex) meta.seriesIndex = col.position
  }
  if (!meta.title && meta.titles.length) meta.title = meta.titles[0].value
  if (!meta.language && meta.languages.length) meta.language = meta.languages[0]
  if (!meta.publisher && meta.publishers.length) meta.publisher = meta.publishers[0].value
  if (!meta.pubDate && meta.dates.length) meta.pubDate = meta.dates[0].value
}

function applyMetaProps(mv: MetaValue, props: Record<string, string>): void {
  for (const [k, v] of Object.entries(props)) mv.refinements[k] = v
  if (props['file-as']) mv.fileAs = props['file-as']
  if (props['role']) mv.role = props['role']
  if (props['display-seq']) mv.displaySeq = atoiSafe(props['display-seq'])
  if (props['title-type'] && !mv.scheme) mv.scheme = props['title-type']
  if (props['date-type'] && !mv.scheme) mv.scheme = props['date-type']
}

/** Port of resolveCover — expects manifest items to have `path` resolved. */
export function resolveCover(manifest: Map<string, ManifestItem>, coverId: string): string {
  if (coverId) {
    const item = manifest.get(coverId)
    if (item) return item.path
  }
  for (const item of manifest.values()) {
    if (item.properties.includes('cover-image')) return item.path
  }
  return ''
}
