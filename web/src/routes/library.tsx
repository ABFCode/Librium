import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useLocalUser } from '../hooks/useLocalUser'

export const Route = createFileRoute('/library')({
  component: Library,
})

function Library() {
  const userId = useLocalUser()
  const books = useQuery(
    api.books.listByOwner,
    userId ? { ownerId: userId } : 'skip',
  )

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="mx-auto w-full max-w-5xl">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h1 className="text-2xl font-semibold text-white">
            Your Library
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Books pulled from Convex.
          </p>
          {!books ? (
            <p className="mt-6 text-sm text-slate-400">Loading...</p>
          ) : books.length === 0 ? (
            <p className="mt-6 text-sm text-slate-400">
              No books yet. Import one from the home page.
            </p>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {books.map((book) => (
                <Link
                  key={book._id}
                  className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm font-semibold text-slate-100 transition hover:border-sky-500"
                  to="/reader/$bookId"
                  params={{ bookId: book._id }}
                >
                  <div>{book.title}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {book.author ?? 'Unknown Author'}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
