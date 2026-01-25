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
              <Link className="btn btn-primary" to="/">
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

          {!books ? (
            <p className="text-sm text-[var(--muted)]">Loading...</p>
          ) : books.length === 0 ? (
            <div className="surface-soft rounded-2xl p-6">
              <p className="text-sm text-[var(--muted)]">
                No books yet. Import one from the home page.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredBooks.map((book, index) => (
                <div key={book._id} className="card group">
                  <Link
                    className="block"
                    to="/reader/$bookId"
                    params={{ bookId: book._id }}
                  >
                    <div className="relative h-48 overflow-hidden">
                      {coverUrls?.[book._id] ? (
                        <img
                          src={coverUrls[book._id] ?? undefined}
                          alt={book.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full bg-[linear-gradient(135deg,rgba(209,161,92,0.22),rgba(143,181,166,0.2))]">
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.25),transparent_70%)]" />
                        </div>
                      )}
                      <div className="absolute bottom-4 left-4 rounded-full border border-white/20 bg-black/30 px-3 py-1 text-[10px] uppercase tracking-[0.4em] text-white/80">
                        Volume {index + 1}
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="text-lg font-semibold">
                        {book.title}
                      </div>
                      <div className="mt-1 text-sm text-[var(--muted)]">
                        {book.author ?? 'Unknown author'}
                      </div>
                    </div>
                  </Link>
                  <div className="flex items-center justify-between border-t border-white/5 px-4 py-3 text-xs uppercase tracking-[0.3em] text-[var(--muted-2)]">
                    <button
                      className="hover:text-[var(--accent-2)]"
                      onClick={() => handleDownload(book._id, book.title)}
                    >
                      Download
                    </button>
                    <button
                      className="hover:text-[var(--danger)]"
                      onClick={() => handleDelete(book._id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </RequireAuth>
  )
}
