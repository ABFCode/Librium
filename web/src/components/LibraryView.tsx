import { Link } from '@tanstack/react-router'
import { useAction, useConvex, useConvexAuth, useQuery } from 'convex/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { api } from '../../convex/_generated/api'
import { RequireAuth } from './RequireAuth'
import { useEffect, useMemo, useState } from 'react'
import { db, deleteLocalBook } from '../lib/db'

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
          progress: total > 0 ? (p.sectionIndex + 1) / total : 0,
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
          <div className="surface flex flex-wrap items-center gap-3 rounded-[18px] px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase tracking-[0.35em] text-[var(--muted-2)]">
                Library
              </span>
              <span className="text-[11px] uppercase tracking-[0.3em] text-[var(--muted-2)]">
                {books ? `${books.length} book${books.length === 1 ? '' : 's'}` : '...'}
              </span>
            </div>
            <div className="ml-auto flex flex-1 flex-wrap items-center justify-end gap-2">
              <input
                className="input h-10 max-w-[240px]"
                placeholder="Search titles, authors..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.3em] text-[var(--muted-2)]">
                {[
                  { key: 'recent', label: 'Recent' },
                  { key: 'title', label: 'Title' },
                  { key: 'author', label: 'Author' },
                  { key: 'progress', label: 'Progress' },
                ].map((option) => (
                  <button
                    key={option.key}
                    className={`rounded-full border px-3 py-1 transition ${
                      sortBy === option.key
                        ? 'border-[rgba(209,161,92,0.6)] bg-[rgba(209,161,92,0.15)] text-[var(--accent)]'
                        : 'border-white/10 text-[var(--muted-2)]'
                    }`}
                    onClick={() => setSortBy(option.key as typeof sortBy)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <Link className="btn btn-primary h-10 px-4" to="/import">
                Upload books
              </Link>
            </div>
            {error ? (
              <p className="w-full text-sm text-[var(--danger)]">{error}</p>
            ) : null}
          </div>

          {!books ? (
            <p className="text-sm text-[var(--muted)]">Loading...</p>
          ) : books.length === 0 ? (
            <div className="surface-soft rounded-2xl p-6">
              <p className="text-sm text-[var(--muted)]">
                No books yet. Upload your first EPUB to get started.
              </p>
            </div>
          ) : (
            <div className="grid justify-items-center gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {sortedBooks.map((book) => {
                const coverUrl = coverUrls?.[book._id]
                const progress = progressByBookId.get(book._id)
                const progressPercent = progress
                  ? Math.round(progress.progress * 100)
                  : null
                const showProgressBadge =
                  progressPercent !== null && progressPercent > 0
                return (
                  <div
                    key={book._id}
                    className="book-card group w-full max-w-[190px]"
                  >
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
                          <div className="h-full w-full bg-[linear-gradient(135deg,rgba(209,161,92,0.22),rgba(143,181,166,0.2))]">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.25),transparent_70%)]" />
                          </div>
                        )}
                        {showProgressBadge ? (
                          <div className="progress-badge">{`${progressPercent}%`}</div>
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
                          className="book-menu-btn"
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
                            className="book-menu"
                            onMouseLeave={() => setOpenMenuId(null)}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              className="book-menu-item"
                              onClick={async () => {
                                setOpenMenuId(null)
                                await handleDownload(book._id, book.title)
                              }}
                            >
                              Download
                            </button>
                            <button
                              className="book-menu-item is-danger"
                              onClick={async () => {
                                setOpenMenuId(null)
                                await handleDelete(book._id)
                              }}
                            >
                              Remove
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
