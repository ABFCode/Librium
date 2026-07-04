import Dexie, { type Table } from 'dexie'

// Version of @abfcode/spine that produced the locally stored blocks. Used to
// detect stale parses once re-parsing from the raw EPUB lands (ROADMAP Phase 5).
// Keep in sync with the dependency version in package.json.
export const PARSER_VERSION = '0.1.0'

// ── Row types ────────────────────────────────────────────────────────────────

export type LocalBook = {
  bookId: string // Convex books._id
  title: string
  author?: string
  coverBlob?: Blob
  coverType?: string
  sectionCount: number
  parserVersion: string
  addedAt: number
}

export type LocalSection = {
  bookId: string
  orderIndex: number
  convexId?: string // Convex sections._id, backfilled after ingest
  title: string
  depth: number
  href?: string
  anchor?: string
  // undefined = metadata-only row (blocks not cached on this device yet)
  blocks?: unknown[]
}

export type LocalImage = {
  bookId: string
  href: string
  blob: Blob
  contentType?: string
}

// ── Database ─────────────────────────────────────────────────────────────────

class LibriumDB extends Dexie {
  books!: Table<LocalBook, string>
  sections!: Table<LocalSection, [string, number]>
  images!: Table<LocalImage, [string, string]>

  constructor() {
    super('librium')
    this.version(1).stores({
      books: 'bookId',
      sections: '[bookId+orderIndex], bookId',
      images: '[bookId+href], bookId',
    })
  }
}

export const db = new LibriumDB()

// Section key used when a section exists locally but its Convex id is not
// known yet (e.g. ingest backfill failed). Never sent to Convex functions.
export const localSectionKey = (bookId: string, orderIndex: number) =>
  `local:${bookId}:${orderIndex}`

export const isLocalSectionKey = (id: string) => id.startsWith('local:')

// ── Import path ──────────────────────────────────────────────────────────────

export async function saveImportedBook(input: {
  bookId: string
  title: string
  author?: string
  cover?: { blob: Blob; contentType?: string }
  sections: {
    orderIndex: number
    title: string
    depth: number
    href?: string
    anchor?: string
    blocks: unknown[]
  }[]
  images: { href: string; blob: Blob; contentType?: string }[]
}) {
  const { bookId } = input
  await db.transaction('rw', db.books, db.sections, db.images, async () => {
    await db.books.put({
      bookId,
      title: input.title,
      author: input.author,
      coverBlob: input.cover?.blob,
      coverType: input.cover?.contentType,
      sectionCount: input.sections.length,
      parserVersion: PARSER_VERSION,
      addedAt: Date.now(),
    })
    await db.sections.bulkPut(
      input.sections.map((s) => ({ bookId, ...s })),
    )
    await db.images.bulkPut(
      input.images.map((img) => ({ bookId, ...img })),
    )
  })
}

export async function backfillSectionIds(
  bookId: string,
  pairs: { orderIndex: number; convexId: string }[],
) {
  await db.transaction('rw', db.sections, async () => {
    for (const { orderIndex, convexId } of pairs) {
      await db.sections
        .where('[bookId+orderIndex]')
        .equals([bookId, orderIndex])
        .modify({ convexId })
    }
  })
}

// ── Cache-fill path (book imported on another device) ───────────────────────

export async function cacheSectionMeta(
  bookId: string,
  rows: {
    orderIndex: number
    convexId: string
    title: string
    depth: number
    href?: string
    anchor?: string
  }[],
) {
  await db.transaction('rw', db.sections, async () => {
    const keys = rows.map((r) => [bookId, r.orderIndex] as [string, number])
    const existing = await db.sections.bulkGet(keys)
    const toPut: LocalSection[] = []
    rows.forEach((row, i) => {
      const current = existing[i]
      // Preserve already-cached blocks; only add/refresh metadata.
      toPut.push({ bookId, ...row, blocks: current?.blocks })
    })
    await db.sections.bulkPut(toPut)
  })
}

export async function cacheSectionBlocks(
  bookId: string,
  orderIndex: number,
  blocks: unknown[],
  convexId?: string,
) {
  const existing = await db.sections.get([bookId, orderIndex])
  await db.sections.put({
    bookId,
    orderIndex,
    convexId: convexId ?? existing?.convexId,
    title: existing?.title ?? '',
    depth: existing?.depth ?? 0,
    href: existing?.href,
    anchor: existing?.anchor,
    blocks,
  })
}

export async function getLocalBlocks(
  bookId: string,
  orderIndex: number,
): Promise<unknown[] | null> {
  const row = await db.sections.get([bookId, orderIndex])
  return row?.blocks ?? null
}

export async function cacheImage(
  bookId: string,
  href: string,
  blob: Blob,
  contentType?: string,
) {
  await db.images.put({ bookId, href, blob, contentType })
}

// ── Delete parity ────────────────────────────────────────────────────────────

export async function deleteLocalBook(bookId: string) {
  await db.transaction('rw', db.books, db.sections, db.images, async () => {
    await db.books.delete(bookId)
    await db.sections.where('bookId').equals(bookId).delete()
    await db.images.where('bookId').equals(bookId).delete()
  })
}
