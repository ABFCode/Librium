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
