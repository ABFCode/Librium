import Dexie, { type Table } from 'dexie'

// Version of @abfcode/spine that produced the locally stored blocks. Used to
// detect stale parses once re-parsing from the raw EPUB lands (ROADMAP Phase 5).
// Keep in sync with the dependency version in package.json.
export const PARSER_VERSION = '0.1.1'

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

export type LocalBookmark = {
  // Client-generated UUID; the stable identity across devices (the server
  // stores it for idempotent creates and cross-device matching).
  clientKey: string
  bookId: string
  sectionIndex: number
  blockIndex: number
  offset: number
  label?: string
  createdAt: number
  // Tombstone: set on delete; the row is removed once the server confirms.
  deletedAt?: number
  // 1 = create or delete not yet acknowledged by the server.
  dirty: 0 | 1
  convexId?: string
}

export type LocalProgress = {
  bookId: string
  sectionIndex: number
  blockIndex: number
  blockOffset: number
  // Device wall-clock time of the edit — compared only against this same
  // user's other devices (LWW ordering of edits).
  editedAt: number
  // 1 = not yet accepted by the server (offline or pending push).
  dirty: 0 | 1
  // Server updatedAt of the last remote state merged into this record; pull
  // ordering compares against this, never against device clocks.
  syncedServerTime: number
}

// ── Database ─────────────────────────────────────────────────────────────────

class LibriumDB extends Dexie {
  books!: Table<LocalBook, string>
  sections!: Table<LocalSection, [string, number]>
  images!: Table<LocalImage, [string, string]>
  progress!: Table<LocalProgress, string>
  bookmarks!: Table<LocalBookmark, string>

  constructor() {
    super('librium')
    this.version(1).stores({
      books: 'bookId',
      sections: '[bookId+orderIndex], bookId',
      images: '[bookId+href], bookId',
    })
    this.version(2).stores({
      progress: 'bookId',
    })
    this.version(3).stores({
      bookmarks: 'clientKey, bookId',
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

export async function getLocalBlocks(
  bookId: string,
  orderIndex: number,
): Promise<unknown[] | null> {
  const row = await db.sections.get([bookId, orderIndex])
  return row?.blocks ?? null
}

// Remove this device's *content cache* for a book (sections + images) while
// keeping the shelf row (title/cover), progress, and bookmarks — the book
// stays in the library everywhere and re-seeds from R2 on demand.
export async function removeLocalContent(bookId: string) {
  await db.transaction('rw', db.books, db.sections, db.images, async () => {
    await db.sections.where('bookId').equals(bookId).delete()
    await db.images.where('bookId').equals(bookId).delete()
    // parserVersion doubles as the "content is on this device" marker.
    await db.books
      .where('bookId')
      .equals(bookId)
      .modify({ parserVersion: '' })
  })
}

// ── Delete parity ────────────────────────────────────────────────────────────

export async function deleteLocalBook(bookId: string) {
  await db.transaction(
    'rw',
    db.books,
    db.sections,
    db.images,
    db.progress,
    db.bookmarks,
    async () => {
      await db.books.delete(bookId)
      await db.sections.where('bookId').equals(bookId).delete()
      await db.images.where('bookId').equals(bookId).delete()
      await db.progress.delete(bookId)
      await db.bookmarks.where('bookId').equals(bookId).delete()
    },
  )
}
