import { renderHook } from 'vitest-browser-react'
import { describe, it, expect, vi } from 'vitest'
import { useImportFlow } from '../hooks/useImportFlow'

vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
  useQuery: () => [],
}))

describe('useImportFlow', () => {
  it('filters non-epub files and reports an error', async () => {
    const { result, act } = await renderHook(() => useImportFlow())
    const txt = new File(['hello'], 'notes.txt', { type: 'text/plain' })

    await act(() => {
      result.current.addFiles([txt])
    })

    expect(result.current.files).toHaveLength(0)
    expect(result.current.error).toBe('Only EPUB files are supported.')
  })

  it('deduplicates files by name, size, and lastModified', async () => {
    const { result, act } = await renderHook(() => useImportFlow())
    const first = new File(['a'], 'book.epub', {
      type: 'application/epub+zip',
      lastModified: 123,
    })
    const duplicate = new File(['a'], 'book.epub', {
      type: 'application/epub+zip',
      lastModified: 123,
    })
    const second = new File(['b'], 'other.epub', {
      type: 'application/epub+zip',
      lastModified: 456,
    })

    await act(() => {
      result.current.addFiles([first, second])
    })
    expect(result.current.files).toHaveLength(2)

    await act(() => {
      result.current.addFiles([duplicate])
    })
    expect(result.current.files).toHaveLength(2)
  })

  it('maps import job status to user-facing labels', async () => {
    const { result } = await renderHook(() => useImportFlow())

    expect(result.current.statusLabel('completed')).toBe('Ready')
    expect(result.current.statusLabel('failed')).toBe('Failed')
    expect(result.current.statusLabel('parsing')).toBe('Processing')
    expect(result.current.statusLabel('ingesting')).toBe('Processing')
    expect(result.current.statusLabel('queued')).toBe('Queued')
    expect(result.current.statusLabel('unknown')).toBe('Queued')
  })
})
