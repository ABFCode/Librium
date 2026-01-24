import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'

type ReaderChunk = {
  id: string
  content: string
}

export const Route = createFileRoute('/reader/$bookId')({
  component: Reader,
})

function Reader() {
  const { bookId } = Route.useParams()
  const [chunks, setChunks] = useState<ReaderChunk[]>([])
  const [nextIndex, setNextIndex] = useState<number | null>(0)
  const [isLoading, setIsLoading] = useState(false)
  const parentRef = useRef<HTMLDivElement | null>(null)

  const loadChunks = async () => {
    if (nextIndex === null || isLoading) {
      return
    }
    setIsLoading(true)
    const response = await fetch(
      `/api/chunks?sectionId=section-1&startIndex=${nextIndex}&limit=30`,
    )
    const body = await response.json()
    setChunks((prev) => [...prev, ...body.chunks])
    setNextIndex(body.nextIndex)
    setIsLoading(false)
  }

  useEffect(() => {
    loadChunks()
  }, [])

  const rowVirtualizer = useVirtualizer({
    count: chunks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 10,
  })

  return (
    <div className="App">
      <header className="App-header">
        <h1>Reader</h1>
        <p>Book: {bookId}</p>
        <div
          ref={parentRef}
          style={{
            height: '60vh',
            width: '80%',
            overflow: 'auto',
            border: '1px solid #444',
            borderRadius: 8,
            padding: 12,
          }}
        >
          <div
            style={{
              height: rowVirtualizer.getTotalSize(),
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const chunk = chunks[virtualRow.index]
              return (
                <div
                  key={chunk.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    padding: '8px 0',
                  }}
                >
                  {chunk.content}
                </div>
              )
            })}
          </div>
        </div>
        <button
          className="App-link"
          onClick={loadChunks}
          disabled={isLoading || nextIndex === null}
        >
          {nextIndex === null
            ? 'End of section'
            : isLoading
              ? 'Loading...'
              : 'Load more'}
        </button>
      </header>
    </div>
  )
}
