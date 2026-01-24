import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { useLocalUser } from '../../hooks/useLocalUser'

type ReaderChunk = {
  id: string
  content: string
}

export const Route = createFileRoute('/reader/$bookId')({
  component: Reader,
})

function Reader() {
  const { bookId } = Route.useParams()
  const userId = useLocalUser()
  const sections = useQuery(api.sections.listSections, { bookId })
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [chunks, setChunks] = useState<ReaderChunk[]>([])
  const [nextIndex, setNextIndex] = useState<number | null>(0)
  const [isLoading, setIsLoading] = useState(false)
  const parentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (sections && sections.length > 0 && !activeSectionId) {
      setActiveSectionId(sections[0]._id)
    }
  }, [sections, activeSectionId])

  const sectionId = activeSectionId ?? null
  const chunkQuery = useQuery(
    api.chunks.listChunksBySection,
    sectionId && nextIndex !== null
      ? { sectionId, startIndex: nextIndex, limit: 30 }
      : 'skip',
  )

  const loadChunks = async () => {
    if (nextIndex === null || isLoading) {
      return
    }
    if (!chunkQuery) {
      return
    }
    setIsLoading(true)
    const nextChunks = chunkQuery.map((chunk) => ({
      id: chunk._id,
      content: chunk.content,
    }))
    setChunks((prev) => [...prev, ...nextChunks])
    const next = nextIndex + nextChunks.length
    setNextIndex(nextChunks.length === 0 ? null : next)
    setIsLoading(false)
  }

  useEffect(() => {
    if (chunkQuery && chunks.length === 0) {
      loadChunks()
    }
  }, [chunkQuery])

  useEffect(() => {
    setChunks([])
    setNextIndex(0)
  }, [sectionId])

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
        {!userId ? <p>Loading user...</p> : null}
        {!sections ? <p>Loading sections...</p> : null}
        {sections && sections.length === 0 ? (
          <p>No sections yet. Parser output not loaded.</p>
        ) : null}
        {sections && sections.length > 0 ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {sections.map((section) => (
              <button
                key={section._id}
                className="App-link"
                onClick={() => setActiveSectionId(section._id)}
                disabled={section._id === sectionId}
              >
                {section.title}
              </button>
            ))}
          </div>
        ) : null}
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
          disabled={isLoading || nextIndex === null || !sectionId}
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
