import { Link } from '@tanstack/react-router'
import { useAction, useConvex, useConvexAuth, useQuery } from 'convex/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { api } from '../../convex/_generated/api'
import { RequireAuth } from './RequireAuth'
import { useEffect, useMemo, useState } from 'react'
import {
  db,
  deleteLocalBook,
  purgeOrphanedContent,
  removeLocalContent,
} from '../lib/db'
import { seedBookFromR2 } from '../lib/seedBook'

// Whole-MB floor: browser storage estimates wobble at KB granularity
// (SQLite WAL churn, estimate padding), which reads as jumpy noise.
const formatBytes = (bytes: number) => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  return '< 1 MB'
}

type LibraryBook = {
  _id: string
  title: string
  author?: string | null
  sectionCount?: number
  createdAt?: number
  updatedAt?: number
}

// Grace period before purging a local book missing from the remote list —
// covers the moment between a fresh import's local write and the reactive
// remote list catching up.
const PURGE_GRACE_MS = 60_000

export function Library() {
  const convex = useConvex()
  const { isAuthenticated } = useConvexAuth()
  const canQuery = isAuthenticated
  const deleteBook = useAction(api.books.deleteBook)

  // Local-first: the shelf renders from IndexedDB when the server list is
  // unavailable (offline); the remote list is authoritative when present.
  const remoteBooks = useQuery(api.books.listByOwner, canQuery ? {} : 'skip')
  const localBooks = useLiveQuery(() => db.books.toArray(), [])
  const localProgress = useLiveQuery(() => db.progress.toArray(), [])

  const books: LibraryBook[] | undefined = useMemo(() => {
    if (remoteBooks) {
      return remoteBooks as LibraryBook[]
    }
    if (localBooks === undefined) {
      return undefined
    }
    if (localBooks.length > 0) {
      const progressTimes = new Map(
        (localProgress ?? []).map((p) => [p.bookId, p.editedAt]),
      )
      return localBooks.map((b) => ({
        _id: b.bookId,
        title: b.title,
        author: b.author,
        sectionCount: b.sectionCount,
        createdAt: b.addedAt,
        updatedAt: progressTimes.get(b.bookId) ?? b.addedAt,
      }))
    }
    // Empty local shelf: online, wait for the server; offline, show empty.
    return canQuery ? undefined : []
  }, [remoteBooks, localBooks, localProgress, canQuery])

  const progressEntries = useQuery(
    api.userBooks.listByUser,
    canQuery ? {} : 'skip',
  )
  const recentEntries = useQuery(
    api.userBooks.listRecentByUser,
    canQuery ? { limit: books?.length ?? 200 } : 'skip',
  )

  // Which books have their content cached on this device (parserVersion set
  // = full local parse; metadata-only shelf rows have it empty).
  const downloadedIds = useMemo(() => {
    const set = new Set<string>()
    for (const b of localBooks ?? []) {
      if (b.parserVersion) {
        set.add(b.bookId)
      }
    }
    return set
  }, [localBooks])

  // Local storage usage. The estimate is origin-wide, so prefer the
  // IndexedDB portion when the browser breaks it down (Chrome) — the
  // total also counts service-worker caches and anything else ever
  // stored on this origin.
  const [storageUsage, setStorageUsage] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
      return
    }
    void navigator.storage.estimate().then((est) => {
      const detailed = (
        est as { usageDetails?: { indexedDB?: number } }
      ).usageDetails?.indexedDB
      const usage = detailed ?? est.usage
      if (!cancelled && typeof usage === 'number') {
        setStorageUsage(usage)
      }
    })
    return () => {
      cancelled = true
    }
    // Re-measure only when the shelf actually changes — measuring on every
    // IndexedDB write makes the figure visibly jitter.
  }, [downloadedIds.size, books?.length])

  // Bulk operations (global; per-book actions live in each card's menu).
  const [bulkStatus, setBulkStatus] = useState<string | null>(null)
  const [isBulkMenuOpen, setIsBulkMenuOpen] = useState(false)

  const handleDownloadAll = async () => {
    const targets = (books ?? []).filter((b) => !downloadedIds.has(b._id))
    if (targets.length === 0 || bulkStatus) {
      return
    }
    setError(null)
    let done = 0
    for (const book of targets) {
      setBulkStatus(`Downloading… ${done}/${targets.length}`)
      try {
        await seedBookFromR2(convex, book._id)
      } catch {
        // Skip failures (e.g. upload still pending); continue with the rest.
      }
      done += 1
    }
    setBulkStatus(null)
  }

  const handleRemoveAllDownloads = async () => {
    const ids = Array.from(downloadedIds)
    if (ids.length === 0 || bulkStatus) {
      return
    }
    const ok = window.confirm(
      `Remove ${ids.length} downloaded book(s) from this device? Your library, progress, and bookmarks are unaffected — books re-download when opened.`,
    )
    if (!ok) {
      return
    }
    setError(null)
    setBulkStatus('Removing downloads…')
    for (const id of ids) {
      try {
        await removeLocalContent(id)
      } catch {
        // Continue; the reconcile pass can retry later.
      }
    }
    setBulkStatus(null)
  }

  const handleDeleteAllBooks = async () => {
    const list = books ?? []
    if (list.length === 0 || bulkStatus) {
      return
    }
    const typed = window.prompt(
      `This permanently deletes all ${list.length} book(s) from your library and cloud backup, on every device. Type DELETE to confirm.`,
    )
    if (typed !== 'DELETE') {
      return
    }
    setError(null)
    let done = 0
    for (const book of list) {
      setBulkStatus(`Deleting… ${done}/${list.length}`)
      try {
        await deleteBook({ bookId: book._id as never })
        await deleteLocalBook(book._id).catch(() => {})
      } catch (err) {
        setError(
          err instanceof Error ? err.message : `Failed to delete ${book.title}`,
        )
      }
      done += 1
    }
    setBulkStatus(null)
  }

  // Durability escape hatch: pull every raw EPUB back out of R2 (egress is
  // free). Sequential to keep the browser's multi-download prompt tame.
  const handleExportAll = async () => {
    const list = books ?? []
    if (list.length === 0 || bulkStatus) {
      return
    }
    setError(null)
    let done = 0
    for (const book of list) {
      setBulkStatus(`Exporting… ${done}/${list.length}`)
      try {
        await handleDownload(book._id, book.title)
        // Give the browser breathing room between download triggers.
        await new Promise((resolve) => setTimeout(resolve, 600))
      } catch {
        // Skip failures (e.g. upload still pending); continue with the rest.
      }
      done += 1
    }
    setBulkStatus(null)
  }

  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const handleDeviceDownload = async (bookId: string) => {
    try {
      setError(null)
      setDownloadingId(bookId)
      await seedBookFromR2(convex, bookId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setDownloadingId(null)
    }
  }
  const handleRemoveDownload = async (bookId: string) => {
    try {
      setError(null)
      await removeLocalContent(bookId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove download')
    }
  }

  // Covers: object URLs from local blobs; ask the server only for the rest.
  const [localCoverUrls, setLocalCoverUrls] = useState<Record<string, string>>(
    {},
  )
  useEffect(() => {
    if (!localBooks) {
      return
    }
    const created: string[] = []
    const urls: Record<string, string> = {}
    for (const b of localBooks) {
      if (b.coverBlob) {
        const url = URL.createObjectURL(b.coverBlob)
        urls[b.bookId] = url
        created.push(url)
      }
    }
    setLocalCoverUrls(urls)
    return () => {
      created.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [localBooks])

  const missingCoverIds = useMemo(
    () => (books ?? []).map((b) => b._id).filter((id) => !localCoverUrls[id]),
    [books, localCoverUrls],
  )
  const remoteCoverUrls = useQuery(
    api.books.getCoverUrls,
    canQuery && missingCoverIds.length > 0
      ? { bookIds: missingCoverIds as never }
      : 'skip',
  )
  const coverUrls = useMemo(
    () => ({ ...(remoteCoverUrls ?? {}), ...localCoverUrls }),
    [remoteCoverUrls, localCoverUrls],
  )

  // Reconcile local ↔ remote: purge local copies of books deleted elsewhere,
  // and cache-fill shelf rows for books imported on another device.
  useEffect(() => {
    if (!remoteBooks || localBooks === undefined) {
      return
    }
    const remoteIds = new Set(remoteBooks.map((b) => b._id as string))
    const localIds = new Set(localBooks.map((b) => b.bookId))
    void (async () => {
      for (const local of localBooks) {
        if (
          !remoteIds.has(local.bookId) &&
          Date.now() - local.addedAt > PURGE_GRACE_MS
        ) {
          try {
            await deleteLocalBook(local.bookId)
          } catch {
            // Retried on the next reconcile.
          }
        }
      }
      for (const remote of remoteBooks) {
        if (!localIds.has(remote._id as string)) {
          try {
            await db.books.put({
              bookId: remote._id as string,
              title: remote.title,
              author: remote.author ?? undefined,
              sectionCount: remote.sectionCount ?? 0,
              // Metadata-only row: blocks arrive via reader cache-fill; the
              // parser version applies only once blocks exist.
              parserVersion: '',
              addedAt: Date.now(),
            })
          } catch {
            // IndexedDB unavailable — shelf still renders from the server.
          }
        }
      }
      // Sweep content rows with no shelf row (interrupted deletes, legacy
      // dev data) so the storage figure reflects the actual library.
      try {
        await purgeOrphanedContent()
      } catch {
        // Best-effort hygiene; retried on the next reconcile.
      }
    })()
  }, [remoteBooks, localBooks])

  // Cache-fill remote covers into IndexedDB so the shelf has art offline.
  useEffect(() => {
    if (!remoteCoverUrls) {
      return
    }
    let cancelled = false
    void (async () => {
      for (const [bookId, url] of Object.entries(remoteCoverUrls)) {
        if (cancelled || !url) {
          continue
        }
        try {
          const row = await db.books.get(bookId)
          if (!row || row.coverBlob) {
            continue
          }
          const res = await fetch(url)
          if (!res.ok) {
            continue
          }
          const blob = await res.blob()
          await db.books.update(bookId, {
            coverBlob: blob,
            coverType: blob.type || undefined,
          })
        } catch {
          // Offline or transient — retried next visit.
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [remoteCoverUrls])
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<'recent' | 'title' | 'author' | 'progress'>('recent')
  const [error, setError] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const saved = window.localStorage.getItem('library:sort')
    if (
      saved === 'recent' ||
      saved === 'title' ||
      saved === 'author' ||
      saved === 'progress'
    ) {
      setSortBy(saved)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem('library:sort', sortBy)
  }, [sortBy])

  const progressByBookId = useMemo(() => {
    const map = new Map<string, { progress: number; updatedAt?: number }>()
    if (progressEntries) {
      for (const entry of progressEntries) {
        map.set(entry.bookId, {
          progress: entry.progress,
          updatedAt: entry.updatedAt,
        })
      }
      return map
    }
    // Offline: derive progress from the local records.
    if (localProgress) {
      const counts = new Map(
        (localBooks ?? []).map((b) => [b.bookId, b.sectionCount]),
      )
      for (const p of localProgress) {
        const total = counts.get(p.bookId) ?? 0
        map.set(p.bookId, {
          // Chapters completed — mirrors userBooks.listByUser.
          progress: total > 0 ? p.sectionIndex / total : 0,
          updatedAt: p.editedAt,
        })
      }
    }
    return map
  }, [progressEntries, localProgress, localBooks])

  const recentOrder = useMemo(() => {
    if (!recentEntries) {
      return new Map<string, number>()
    }
    const map = new Map<string, number>()
    recentEntries.forEach((entry, index) => {
      map.set(entry.book._id, index)
    })
    return map
  }, [recentEntries])

  const filteredBooks = useMemo(() => {
    if (!books) {
      return []
    }
    if (!query.trim()) {
      return books
    }
    const lower = query.toLowerCase()
    return books.filter((book) => {
      return (
        book.title.toLowerCase().includes(lower) ||
        (book.author ?? '').toLowerCase().includes(lower)
      )
    })
  }, [books, query])

  const sortedBooks = useMemo(() => {
    const next = [...filteredBooks]
    if (sortBy === 'recent') {
      next.sort((a, b) => {
        const aRank = recentOrder.get(a._id)
        const bRank = recentOrder.get(b._id)
        if (aRank !== undefined && bRank !== undefined) {
          return aRank - bRank
        }
        if (aRank !== undefined) {
          return -1
        }
        if (bRank !== undefined) {
          return 1
        }
        return (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0)
      })
    } else if (sortBy === 'title') {
      next.sort((a, b) => a.title.localeCompare(b.title))
    } else if (sortBy === 'author') {
      next.sort((a, b) => (a.author ?? '').localeCompare(b.author ?? ''))
    } else if (sortBy === 'progress') {
      next.sort((a, b) => {
        const aProgress = progressByBookId.get(a._id)?.progress ?? 0
        const bProgress = progressByBookId.get(b._id)?.progress ?? 0
        return bProgress - aProgress
      })
    }
    return next
  }, [filteredBooks, progressByBookId, recentOrder, sortBy])

  const handleDelete = async (bookId: string) => {
    const confirmDelete = window.confirm(
      'Delete this book and its stored files?',
    )
    if (!confirmDelete) {
      return
    }
    try {
      setError(null)
      await deleteBook({ bookId })
      // Delete parity: purge this device's local copy too.
      await deleteLocalBook(bookId).catch(() => {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete book')
    }
  }

  const handleDownload = async (bookId: string, fileName: string) => {
    try {
      setError(null)
      const url = (await convex.query(api.books.getEpubUrl, {
        bookId: bookId as never,
      })) as string | null
      if (!url) {
        setError('Unable to generate download link.')
        return
      }
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    }
  }

  return (
    <RequireAuth>
      <div className="min-h-screen px-6 pb-16 pt-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl">Library</h1>
              <p className="mt-1 text-sm text-[var(--muted-2)]">
                {!books
                  ? 'Loading…'
                  : books.length === 0
                    ? 'No books yet'
                    : `${books.length} book${books.length === 1 ? '' : 's'} · ${downloadedIds.size} on this device${storageUsage !== null ? ` · ${formatBytes(storageUsage)} used` : ''}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input h-9 w-[220px]"
                placeholder="Search titles, authors…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="flex items-center gap-1">
                {[
                  { key: 'recent', label: 'Recent' },
                  { key: 'title', label: 'Title' },
                  { key: 'author', label: 'Author' },
                  { key: 'progress', label: 'Progress' },
                ].map((option) => (
                  <button
                    key={option.key}
                    className={`chip ${sortBy === option.key ? 'is-active' : ''}`}
                    onClick={() => setSortBy(option.key as typeof sortBy)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div
                className="relative"
                onMouseLeave={() => setIsBulkMenuOpen(false)}
              >
                <button
                  className={`icon-btn ${isBulkMenuOpen ? 'is-active' : ''}`}
                  onClick={() => setIsBulkMenuOpen((prev) => !prev)}
                >
                  <span className="sr-only">Library actions</span>
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
                    <circle cx="5" cy="12" r="1.5" />
                    <circle cx="12" cy="12" r="1.5" />
                    <circle cx="19" cy="12" r="1.5" />
                  </svg>
                </button>
                {isBulkMenuOpen ? (
                  <div className="menu absolute right-0 top-9 z-20">
                    <button
                      className="menu-item"
                      onClick={() => {
                        setIsBulkMenuOpen(false)
                        void handleDownloadAll()
                      }}
                      disabled={
                        bulkStatus !== null ||
                        !books ||
                        books.length === downloadedIds.size
                      }
                      title="Store every book's content on this device (e.g. before going offline)"
                    >
                      Download all to this device
                    </button>
                    <button
                      className="menu-item"
                      onClick={() => {
                        setIsBulkMenuOpen(false)
                        void handleRemoveAllDownloads()
                      }}
                      disabled={bulkStatus !== null || downloadedIds.size === 0}
                      title="Free this device's storage; the library itself is untouched"
                    >
                      Clear downloads
                    </button>
                    <button
                      className="menu-item"
                      onClick={() => {
                        setIsBulkMenuOpen(false)
                        void handleExportAll()
                      }}
                      disabled={bulkStatus !== null || !books || books.length === 0}
                      title="Download every book's EPUB file (cloud backup copy)"
                    >
                      Export all EPUBs
                    </button>
                    <button
                      className="menu-item is-danger"
                      onClick={() => {
                        setIsBulkMenuOpen(false)
                        void handleDeleteAllBooks()
                      }}
                      disabled={bulkStatus !== null || !books || books.length === 0}
                      title="Permanently delete every book, everywhere"
                    >
                      Delete all books…
                    </button>
                  </div>
                ) : null}
              </div>
              <Link className="btn btn-primary h-9" to="/import">
                Upload books
              </Link>
            </div>
          </div>
          {bulkStatus ? (
            <p className="text-sm text-[var(--muted)]">{bulkStatus}</p>
          ) : null}
          {error ? (
            <p className="text-sm text-[var(--danger)]">{error}</p>
          ) : null}

          {!books ? (
            <p className="text-sm text-[var(--muted)]">Loading...</p>
          ) : books.length === 0 ? (
            <div className="surface-soft rounded-2xl p-6">
              <p className="text-sm text-[var(--muted)]">
                No books yet. Upload your first EPUB to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {sortedBooks.map((book) => {
                const coverUrl = coverUrls?.[book._id]
                const progress = progressByBookId.get(book._id)
                const progressPercent = progress
                  ? Math.round(progress.progress * 100)
                  : null
                const showProgressBadge =
                  progressPercent !== null && progressPercent > 0
                return (
                  <div key={book._id} className="book-card group w-full">
                    <Link
                      className="block"
                      to="/reader/$bookId"
                      params={{ bookId: book._id }}
                    >
                      <div
                        className={`book-cover-frame relative aspect-[2/3] w-full overflow-hidden ${
                          coverUrl ? 'has-cover' : ''
                        }`}
                      >
                        {coverUrl ? (
                          <div className="absolute inset-0 overflow-hidden">
                            <img
                              src={coverUrl}
                              alt={book.title}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-[var(--surface-2)] p-3">
                            <span className="line-clamp-4 text-center font-[family-name:var(--font-display)] text-sm text-[var(--muted)]">
                              {book.title}
                            </span>
                          </div>
                        )}
                        {showProgressBadge ? (
                          <div className="progress-badge">{`${progressPercent}%`}</div>
                        ) : null}
                        {downloadedIds.has(book._id) ? (
                          <div className="device-dot" title="On this device" />
                        ) : null}
                      </div>
                    </Link>
                    <div
                      className="book-meta"
                      onMouseLeave={() => setOpenMenuId(null)}
                    >
                      <div className="book-text">
                        <Link
                          className="book-title truncate text-sm font-semibold"
                          to="/reader/$bookId"
                          params={{ bookId: book._id }}
                        >
                          {book.title}
                        </Link>
                        <div className="book-author truncate text-xs text-[var(--muted)]">
                          {book.author ?? 'Unknown author'}
                        </div>
                      </div>
                      <div className="book-menu-shell">
                        <button
                          className="icon-btn"
                          onMouseEnter={() => setOpenMenuId(book._id)}
                          onClick={(event) => {
                            event.stopPropagation()
                            setOpenMenuId((prev) =>
                              prev === book._id ? null : book._id,
                            )
                          }}
                        >
                          <span className="sr-only">Open menu</span>
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
                            <circle cx="12" cy="5" r="1.5" />
                            <circle cx="12" cy="12" r="1.5" />
                            <circle cx="12" cy="19" r="1.5" />
                          </svg>
                        </button>
                        {openMenuId === book._id ? (
                          <div
                            className="menu book-menu"
                            onMouseLeave={() => setOpenMenuId(null)}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {downloadedIds.has(book._id) ? (
                              <button
                                className="menu-item"
                                onClick={async () => {
                                  setOpenMenuId(null)
                                  await handleRemoveDownload(book._id)
                                }}
                              >
                                Remove download
                              </button>
                            ) : (
                              <button
                                className="menu-item"
                                disabled={downloadingId === book._id}
                                onClick={async () => {
                                  setOpenMenuId(null)
                                  await handleDeviceDownload(book._id)
                                }}
                              >
                                {downloadingId === book._id
                                  ? 'Downloading…'
                                  : 'Download to this device'}
                              </button>
                            )}
                            <button
                              className="menu-item"
                              onClick={async () => {
                                setOpenMenuId(null)
                                await handleDownload(book._id, book.title)
                              }}
                            >
                              Save EPUB
                            </button>
                            <button
                              className="menu-item is-danger"
                              onClick={async () => {
                                setOpenMenuId(null)
                                await handleDelete(book._id)
                              }}
                            >
                              Delete book
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </RequireAuth>
  )
}
