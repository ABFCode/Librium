// Port of Spine's data model (types.go). Kinds are string unions here (matching
// the JSON wire contract) rather than Go's int enums.

export interface Metadata {
  title: string
  titles: MetaValue[]
  authors: string[]
  creators: MetaValue[]
  contributors: MetaValue[]
  language: string
  languages: string[]
  identifiers: Identifier[]
  publisher: string
  publishers: MetaValue[]
  pubDate: string
  dates: MetaValue[]
  series: string
  seriesIndex: string
  subjects: MetaValue[]
  rights: MetaValue[]
  descriptions: MetaValue[]
  modified: string
  collections: Collection[]
  coverHref: string
}

export interface CoverInfo {
  href: string
  contentType: string
}

export interface Cover extends CoverInfo {
  bytes: Uint8Array
}

export interface Identifier {
  id: string
  scheme: string
  value: string
  type: string
}

export interface MetaValue {
  id: string
  value: string
  language: string
  scheme: string
  fileAs: string
  role: string
  displaySeq: number
  refinements: Record<string, string>
}

export interface Collection {
  id: string
  name: string
  type: string
  position: string
}

export interface ManifestItem {
  id: string
  href: string
  mediaType: string
  properties: string[]
  path: string
}

export interface SpineItem {
  idRef: string
  href: string
  linear: boolean
  properties: string[]
}

export interface TOCItem {
  id: string
  label: string
  href: string
  children: TOCItem[]
  target?: AnchorRef
}

export interface FlatTOCItem {
  id: string
  label: string
  href: string
  depth: number
  parent: number
  target?: AnchorRef
}

export interface AnchorRef {
  spineIndex: number
  blockIndex: number
  chunkId: string
  offset: number
  href: string
}

export interface Warning {
  code: string
  message: string
  path: string
}

export type BlockKind =
  | 'paragraph'
  | 'heading'
  | 'list_item'
  | 'blockquote'
  | 'pre'
  | 'hr'
  | 'table'
  | 'figure'

export type InlineKind = 'text' | 'emphasis' | 'strong' | 'link' | 'image' | 'code'

export interface Block {
  kind: BlockKind
  level?: number
  ordered?: boolean
  listIndex?: number
  table?: Table
  figure?: Figure
  inlines?: Inline[]
  anchors?: string[]
}

export interface Inline {
  kind: InlineKind
  text?: string
  href?: string
  src?: string
  alt?: string
  emph?: boolean
  strong?: boolean
}

export interface Table {
  rows: TableRow[]
}

export interface TableRow {
  cells: TableCell[]
}

export interface TableCell {
  inlines: Inline[]
  header?: boolean
}

export interface Figure {
  images: Inline[]
  caption: Inline[]
}

export type ChunkingMode = 'paragraph' | 'size'

export interface ChunkingOptions {
  mode: ChunkingMode
  maxChars: number
}

export interface Chunk {
  id: string
  text: string
  href: string
  spineIndex: number
  blockIndexFrom: number
  blockIndexTo: number
  startOffset: number
  endOffset: number
  anchors: string[]
  blocks: Block[]
}
