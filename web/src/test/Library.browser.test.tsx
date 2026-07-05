import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render } from 'vitest-browser-react'
import { getFunctionName } from 'convex/server'
import { api } from '../../convex/_generated/api'
import { Library } from '../components/LibraryView'

const books = [
  {
    _id: 'book1',
    title: 'Alice in Wonderland',
    author: 'Lewis Carroll',
    createdAt: 1,
    updatedAt: 1,
  },
  {
    _id: 'book2',
    title: 'Zen and the Art',
    author: 'Robert Pirsig',
    createdAt: 2,
    updatedAt: 2,
  },
]

const progressEntries = [
  {
    bookId: 'book1',
    lastSectionId: null,
    lastSectionTitle: null,
    lastSectionIndex: 0,
    totalSections: 10,
    progress: 0.1,
    updatedAt: 10,
  },
  {
    bookId: 'book2',
    lastSectionId: null,
    lastSectionTitle: null,
    lastSectionIndex: 0,
    totalSections: 10,
    progress: 0.4,
    updatedAt: 20,
  },
]

const recentEntries = [
  {
    entryId: 'entry2',
    book: books[1],
    lastSectionId: null,
    updatedAt: 20,
  },
  {
    entryId: 'entry1',
    book: books[0],
    lastSectionId: null,
    updatedAt: 10,
  },
]

const coverUrls = {
  book1: null,
  book2: null,
}

// `api` is a proxy (anyApi); references aren't identity-stable across accesses,
// so match on the resolved function name instead of `===`.
const nameOf = (ref: unknown) => getFunctionName(ref as never)
const useQueryMock = vi.fn((query: unknown) => {
  const name = nameOf(query)
  if (name === nameOf(api.books.listByOwner)) {
    return books
  }
  if (name === nameOf(api.userBooks.listByUser)) {
    return progressEntries
  }
  if (name === nameOf(api.userBooks.listRecentByUser)) {
    return recentEntries
  }
  if (name === nameOf(api.books.getCoverUrls)) {
    return coverUrls
  }
  return undefined
})

vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
  useConvex: () => ({ mutation: vi.fn() }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => (
    <a {...props}>{children}</a>
  ),
  createFileRoute: () => () => ({}),
}))

vi.mock('../components/RequireAuth', () => ({
  RequireAuth: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}))

describe('Library', () => {
  beforeEach(() => {
    localStorage.clear()
    useQueryMock.mockClear()
  })

  it('filters the library by search query', async () => {
    const screen = await render(<Library />)
    await screen.getByPlaceholder('Search titles, authors…').fill('alice')

    const cards = screen.container.querySelectorAll('.book-card')
    expect(cards.length).toBe(1)
    // The title renders in both the no-cover placeholder and the meta line —
    // assert on the meta line specifically.
    expect(
      screen.container.querySelector('.book-title')?.textContent,
    ).toBe('Alice in Wonderland')
  })

  it('persists sort selection', async () => {
    const screen = await render(<Library />)
    await screen.getByText('Title').click()
    expect(localStorage.getItem('library:sort')).toBe('title')
  })
})
