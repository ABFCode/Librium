import { createFileRoute, Link } from '@tanstack/react-router'

type LibraryBook = {
  id: string
  title: string
  author: string
}

const sampleBooks: LibraryBook[] = [
  { id: 'demo-1', title: 'Sample Book One', author: 'Unknown Author' },
  { id: 'demo-2', title: 'Sample Book Two', author: 'Unknown Author' },
]

export const Route = createFileRoute('/library')({
  component: Library,
})

function Library() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Your Library</h1>
        <p>Replace this demo list with Convex queries.</p>
        <ul>
          {sampleBooks.map((book) => (
            <li key={book.id}>
              <Link to="/reader/$bookId" params={{ bookId: book.id }}>
                {book.title} — {book.author}
              </Link>
            </li>
          ))}
        </ul>
      </header>
    </div>
  )
}
