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
    estimateSize: () => 120,
    getItemKey: (index) => chunks[index]?.id ?? index,
    overscan: 10,
    measureElement:
      typeof ResizeObserver !== 'undefined'
        ? (element) => element.getBoundingClientRect().height
        : undefined,
  })

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h1 className="text-2xl font-semibold text-white">Reader</h1>
          <p className="mt-2 text-sm text-slate-400">Book: {bookId}</p>
          {!userId ? (
            <p className="mt-4 text-sm text-slate-400">
              Loading user...
            </p>
          ) : null}
          {!sections ? (
            <p className="mt-4 text-sm text-slate-400">
              Loading sections...
            </p>
          ) : null}
          {sections && sections.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">
              No sections yet. Parser output not loaded.
            </p>
          ) : null}
          {sections && sections.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {sections.map((section) => (
                <button
                  key={section._id}
                  className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-sky-400 hover:text-sky-200 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                  onClick={() => setActiveSectionId(section._id)}
                  disabled={section._id === sectionId}
                >
                  {section.title}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div
            ref={parentRef}
            className="h-[60vh] overflow-auto rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-left text-sm text-slate-200"
          >
            {chunks.map((chunk) => (
              <div key={chunk.id} className="py-3 leading-relaxed whitespace-pre-wrap break-words">
                {chunk.content}
              </div>
            ))}
          </div>
        <div>
          <button
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
            onClick={loadChunks}
            disabled={isLoading || nextIndex === null || !sectionId}
          >
            {nextIndex === null
              ? 'End of section'
              : isLoading
                ? 'Loading...'
                : 'Load more'}
          </button>
        </div>
        </div>
      </div>
    </div>
  )
}
