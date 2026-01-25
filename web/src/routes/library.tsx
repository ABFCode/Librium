import { createFileRoute, Link } from '@tanstack/react-router'
import { useConvex, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useLocalUser } from '../hooks/useLocalUser'
import { RequireAuth } from '../components/RequireAuth'
import { useEffect, useMemo, useState } from 'react'

export const Route = createFileRoute('/library')({
  component: Library,
})

function Library() {
  const userId = useLocalUser()
  const convex = useConvex()
  const deleteBook = useMutation(api.books.deleteBook)
  const books = useQuery(
    api.books.listByOwner,
    userId ? { ownerId: userId } : 'skip',
  )
  const progressEntries = useQuery(
    api.userBooks.listByUser,
    userId ? { userId } : 'skip',
  )
  const recentEntries = useQuery(
    api.userBooks.listRecentByUser,
    userId ? { userId, limit: books?.length ?? 200 } : 'skip',
  )
  const coverUrls = useQuery(
    api.books.getCoverUrls,
    books ? { bookIds: books.map((book) => book._id) } : 'skip',
  )
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
    if (!progressEntries) {
      return new Map<string, (typeof progressEntries)[number]>()
    }
    return new Map(progressEntries.map((entry) => [entry.bookId, entry]))
  }, [progressEntries])

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
    if (!userId) {
      return
    }
    const confirmDelete = window.confirm(
      'Delete this book and its stored files?',
    )
    if (!confirmDelete) {
      return
    }
    try {
      setError(null)
      await deleteBook({ userId, bookId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete book')
    }
  }

  const handleDownload = async (bookId: string, fileName: string) => {
    try {
      setError(null)
      const file = await convex.query('bookFiles:getByBook', { bookId })
      if (!file) {
        setError('No file stored for this book yet.')
        return
      }
      const url = await convex.mutation('storage:getFileUrl', {
        storageId: file.storageId,
      })
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
