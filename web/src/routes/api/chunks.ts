import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

type Chunk = {
  id: string
  sectionId: string
  chunkIndex: number
  content: string
}

const chunkCache = new Map<string, Chunk[]>()

const buildChunks = (sectionId: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${sectionId}-chunk-${index}`,
    sectionId,
    chunkIndex: index,
    content: `Section ${sectionId} – chunk ${index + 1}`,
  }))

export const Route = createFileRoute('/api/chunks')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url)
        const sectionId = url.searchParams.get('sectionId') ?? 'section-1'
        const startIndex = Number(url.searchParams.get('startIndex') ?? 0)
        const limit = Number(url.searchParams.get('limit') ?? 20)

        if (!chunkCache.has(sectionId)) {
          chunkCache.set(sectionId, buildChunks(sectionId, 200))
        }

        const chunks = chunkCache.get(sectionId) ?? []
        const slice = chunks.slice(startIndex, startIndex + limit)
        const nextIndex =
          startIndex + limit < chunks.length ? startIndex + limit : null

        return json({
          sectionId,
          startIndex,
          limit,
          nextIndex,
          chunks: slice,
        })
      },
    },
  },
})
