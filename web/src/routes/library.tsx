import { useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery, skip } from 'convex/react'
import type { Id } from 'convex/values'
import { api } from '../../convex/_generated/api'

export const Route = createFileRoute('/library')({
  component: Library,
})

function Library() {
  const [userId, setUserId] = useState<Id<'users'> | null>(null)
  const upsertUser = useMutation(api.users.upsertUser)
  const books = useQuery(
    api.books.listByOwner,
    userId ? { ownerId: userId } : skip,
  )

  useEffect(() => {
    upsertUser({
      authProvider: 'local',
      externalId: 'local-dev',
      name: 'Local Dev',
    }).then(setUserId)
  }, [upsertUser])

  return (
    <div className="App">
      <header className="App-header">
        <h1>Your Library</h1>
        <p>Books pulled from Convex.</p>
        {!books ? (
          <p>Loading...</p>
        ) : books.length === 0 ? (
          <p>No books yet. Import one from the home page.</p>
        ) : (
          <ul>
            {books.map((book) => (
              <li key={book._id}>
                <Link to="/reader/$bookId" params={{ bookId: book._id }}>
                  {book.title} — {book.author ?? 'Unknown Author'}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </header>
    </div>
  )
}
