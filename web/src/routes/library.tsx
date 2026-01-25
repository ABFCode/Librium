import { createFileRoute, Link } from '@tanstack/react-router'
import { useConvex, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useLocalUser } from '../hooks/useLocalUser'
import { RequireAuth } from '../components/RequireAuth'
import { useMemo, useState } from 'react'

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
  const recent = useQuery(
    api.userBooks.listRecentByUser,
    userId ? { userId, limit: 6 } : 'skip',
  )
  const coverUrls = useQuery(
    api.books.getCoverUrls,
    books ? { bookIds: books.map((book) => book._id) } : 'skip',
  )
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

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

  const renderActions = (bookId: string, title: string) => (
    <div className="mt-auto flex items-center justify-between border-t border-white/5 px-4 py-3 text-xs text-[var(--muted-2)]">
      <button
        className="btn btn-ghost text-xs tooltip"
        data-tooltip="Download"
        onClick={() => handleDownload(bookId, title)}
      >
        <span className="sr-only">Download</span>
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
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M7 10l5 5 5-5" />
          <path d="M12 15V3" />
        </svg>
      </button>
      <button
        className="btn btn-ghost text-xs tooltip"
        data-tooltip="Delete"
        onClick={() => handleDelete(bookId)}
      >
        <span className="sr-only">Delete</span>
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
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
      </button>
    </div>
  )

  return (
    <RequireAuth>
      <div className="min-h-screen px-6 pb-16 pt-12">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
          <div className="surface flex flex-col gap-6 rounded-[28px] p-8">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div>
                <span className="pill">Library</span>
                <h1 className="mt-4 text-4xl">Your shelves, curated.</h1>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Every imported EPUB lives here — ready to open, update,
                  or archive.
                </p>
              </div>
              <Link className="btn btn-primary" to="/import">
                Import new
              </Link>
            </div>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <input
                className="input max-w-md"
                placeholder="Search titles, authors..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.3em] text-[var(--muted-2)]">
                <span className="rounded-full border border-white/10 px-3 py-1">
                  Recently added
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1">
                  Author
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1">
                  Progress
                </span>
              </div>
            </div>
            {error ? (
              <p className="text-sm text-[var(--danger)]">{error}</p>
            ) : null}
          </div>

          {recent && recent.length > 0 ? (
            <div className="surface-soft rounded-2xl p-6">
              <div className="text-xs uppercase tracking-[0.3em] text-[var(--muted-2)]">
                Recently opened
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recent.map((entry) => (
                  <Link
                    key={entry.entryId}
                    className="recent-card rounded-2xl border border-white/10 bg-[rgba(12,15,18,0.6)] p-3 text-sm text-[var(--ink)] hover:border-[rgba(209,161,92,0.4)]"
                    to="/reader/$bookId"
                    params={{ bookId: entry.book._id }}
                  >
                    <div className="font-semibold">{entry.book.title}</div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {entry.book.author ?? 'Unknown author'}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {!books ? (
            <p className="text-sm text-[var(--muted)]">Loading...</p>
          ) : books.length === 0 ? (
            <div className="surface-soft rounded-2xl p-6">
              <p className="text-sm text-[var(--muted)]">
                No books yet. Import one from the home page.
              </p>
            </div>
          ) : (
            <div className="grid justify-items-center gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {filteredBooks.map((book) => {
                const coverUrl = coverUrls?.[book._id]
                return (
                  <div
                    key={book._id}
                    className="card book-card group flex w-full max-w-[190px] flex-col overflow-hidden"
                  >
                    <Link
                      className="block"
                      to="/reader/$bookId"
                      params={{ bookId: book._id }}
                    >
                      <div className="p-2">
                        <div className="book-cover-frame relative aspect-[3/4] w-full overflow-hidden rounded-[16px] bg-black/20">
                          {coverUrl ? (
                            <img
                              src={coverUrl}
                              alt={book.title}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="h-full w-full bg-[linear-gradient(135deg,rgba(209,161,92,0.22),rgba(143,181,166,0.2))]">
                              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.25),transparent_70%)]" />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col px-4 py-3">
                        <div className="line-clamp-2 text-base font-semibold">
                          {book.title}
                        </div>
                        <div className="mt-1 line-clamp-1 text-sm text-[var(--muted)]">
                          {book.author ?? 'Unknown author'}
                        </div>
                      </div>
                    </Link>
                    {renderActions(book._id, book.title)}
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
