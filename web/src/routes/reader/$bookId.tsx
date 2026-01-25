import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { useLocalUser } from '../../hooks/useLocalUser'
import { RequireAuth } from '../../components/RequireAuth'

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
  const getSectionText = useAction(api.reader.getSectionText)
  const updateProgress = useMutation(api.userBooks.updateProgress)
  const userBook = useQuery(
    api.userBooks.getUserBook,
    userId ? { userId, bookId } : 'skip',
  )
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [chunks, setChunks] = useState<ReaderChunk[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [fontScale, setFontScale] = useState(0)
  const [isTocOpen, setIsTocOpen] = useState(false)
  const parentRef = useRef<HTMLDivElement | null>(null)

  const sectionId = activeSectionId ?? null

  const activeSection = useMemo(() => {
    if (!sections || !sectionId) {
      return null
    }
    return sections.find((section) => section._id === sectionId) ?? null
  }, [sections, sectionId])

  const fontSize = 16 + fontScale * 2

  useEffect(() => {
    if (!sections || sections.length === 0) {
      return
    }
    if (activeSectionId) {
      return
    }
    if (userBook?.lastSectionId) {
      const match = sections.find(
        (section) => section._id === userBook.lastSectionId,
      )
      if (match) {
        setActiveSectionId(match._id)
        return
      }
    }
    setActiveSectionId(sections[0]._id)
  }, [sections, activeSectionId, userBook])

  const loadSection = async () => {
    if (!sectionId) {
      return
    }
    setIsLoading(true)
    const { text } = await getSectionText({ sectionId })
    const paragraphs = text.split(/\n{2,}/).filter(Boolean)
    setChunks(
      paragraphs.map((content, index) => ({
        id: `${sectionId}-${index}`,
        content,
      })),
    )
    setIsLoading(false)
  }

  useEffect(() => {
    setChunks([])
    void loadSection()
  }, [sectionId])

  useEffect(() => {
    if (!userId || !sectionId) {
      return
    }
    void updateProgress({
      userId,
      bookId,
      lastSectionId: sectionId,
    })
  }, [userId, bookId, sectionId, updateProgress])

  return (
    <RequireAuth>
      <div className="min-h-screen px-6 pb-16 pt-10">
        <div className="mx-auto w-full max-w-6xl">
          <div className="surface flex flex-col gap-4 rounded-[28px] p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <span className="pill">Reader</span>
              <h1 className="mt-3 text-3xl">
                {activeSection?.title ?? 'Untitled section'}
              </h1>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Book ID: {bookId}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="btn btn-ghost text-xs"
                onClick={() => setIsTocOpen((prev) => !prev)}
              >
                {isTocOpen ? 'Hide contents' : 'Show contents'}
              </button>
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[rgba(12,15,18,0.7)] px-3 py-2 text-xs uppercase tracking-[0.3em] text-[var(--muted-2)]">
                <span>Text</span>
                <button
                  className="text-[var(--accent)]"
                  onClick={() => setFontScale((prev) => Math.max(prev - 1, -1))}
                >
                  A-
                </button>
                <button
                  className="text-[var(--accent)]"
                  onClick={() => setFontScale((prev) => Math.min(prev + 1, 2))}
                >
                  A+
                </button>
              </div>
              <button
                className="btn btn-outline text-xs"
                onClick={loadSection}
                disabled={isLoading || !sectionId}
              >
                {isLoading ? 'Refreshing...' : 'Reload'}
              </button>
            </div>
          </div>

          <div className="relative mt-8 grid gap-6 lg:grid-cols-[0.34fr_0.66fr]">
            <div
              className={`fixed inset-0 z-30 bg-black/40 transition-opacity lg:hidden ${
                isTocOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
              onClick={() => setIsTocOpen(false)}
            />
            <aside
              className={`surface fixed right-6 top-28 z-40 h-[70vh] w-[80vw] max-w-sm overflow-hidden rounded-[24px] p-5 transition-transform lg:static lg:top-auto lg:h-auto lg:w-auto lg:translate-x-0 ${
                isTocOpen ? 'translate-x-0' : 'translate-x-[120%]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm uppercase tracking-[0.4em] text-[var(--muted-2)]">
                  Contents
                </div>
                <button
                  className="text-xs text-[var(--muted)] lg:hidden"
                  onClick={() => setIsTocOpen(false)}
                >
                  Close
                </button>
              </div>
              {!sections ? (
                <p className="mt-4 text-sm text-[var(--muted)]">
                  Loading sections...
                </p>
              ) : sections.length === 0 ? (
                <p className="mt-4 text-sm text-[var(--muted)]">
                  No sections yet. Parser output not loaded.
                </p>
              ) : (
                <div className="mt-4 flex max-h-[55vh] flex-col gap-2 overflow-auto pr-2">
                  {sections.map((section) => (
                    <button
                      key={section._id}
                      className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${
                        section._id === sectionId
                          ? 'border-[rgba(209,161,92,0.6)] bg-[rgba(209,161,92,0.15)] text-[var(--ink)]'
                          : 'border-white/10 bg-[rgba(12,15,18,0.6)] text-[var(--muted)] hover:border-white/30'
                      }`}
                      onClick={() => {
                        setActiveSectionId(section._id)
                        setIsTocOpen(false)
                      }}
                      disabled={section._id === sectionId}
                    >
                      <div className="text-xs uppercase tracking-[0.3em] text-[var(--muted-2)]">
                        Section
                      </div>
                      <div className="mt-1 text-base text-[var(--ink)]">
                        {section.title}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </aside>

            <section className="card overflow-hidden">
              {!userId ? (
                <p className="p-6 text-sm text-[var(--muted)]">
                  Loading user...
                </p>
              ) : null}
              <div
                ref={parentRef}
                className="h-[65vh] overflow-auto px-6 py-8 text-left"
                style={{ fontSize: `${fontSize}px` }}
              >
                {chunks.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">
                    Select a section to begin reading.
                  </p>
                ) : (
                  chunks.map((chunk) => (
                    <div
                      key={chunk.id}
                      className="py-3 leading-relaxed whitespace-pre-wrap text-[var(--ink)]"
                    >
                      {chunk.content}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </RequireAuth>
  )
}
