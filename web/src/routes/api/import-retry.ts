import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { enqueueImportByJob } from '../../server/importQueue'

const parserUrl = process.env.PARSER_URL ?? 'http://localhost:8081/parse'
const convexUrl = process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL

const getConvexUrl = () => {
  if (!convexUrl) {
    throw new Error('Missing Convex URL. Set VITE_CONVEX_URL or CONVEX_URL.')
  }
  return convexUrl
}

export const Route = createFileRoute('/api/import-retry')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const importJobId = body?.importJobId
        if (!importJobId) {
          return json({ error: 'Missing importJobId' }, { status: 400 })
        }

        enqueueImportByJob(importJobId, getConvexUrl(), parserUrl)
        return json({ status: 'queued' }, { status: 202 })
      },
    },
  },
})
