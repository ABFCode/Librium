import { ConvexHttpClient } from 'convex/browser'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

const parserUrl = process.env.PARSER_URL ?? 'http://localhost:8081/parse'
const convexUrl = process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL

const getConvexClient = () => {
  if (!convexUrl) {
    throw new Error('Missing Convex URL. Set VITE_CONVEX_URL or CONVEX_URL.')
  }
  return new ConvexHttpClient(convexUrl)
}

export const Route = createFileRoute('/api/import')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const formData = await request.formData()
        const file = formData.get('file')

        if (!(file instanceof File)) {
          return json({ error: 'Missing file' }, { status: 400 })
        }

        const convex = getConvexClient()
        const providedUserId = formData.get('userId')
        const userId =
          typeof providedUserId === 'string' && providedUserId.length > 0
            ? providedUserId
            : await convex.mutation('users:upsertUser', {
                authProvider: 'local',
                externalId: 'local-dev',
                name: 'Local Dev',
              })

        const importJobId = await convex.mutation(
          'importJobs:createImportJob',
          {
            userId,
            fileName: file.name,
            fileSize: file.size,
            contentType: file.type || undefined,
          },
        )

        await convex.mutation('importJobs:updateImportJobStatus', {
          importJobId,
          status: 'in_progress',
        })

        const parserForm = new FormData()
        parserForm.append('file', file, file.name)

        const response = await fetch(parserUrl, {
          method: 'POST',
          body: parserForm,
        })

        const body = await response.json()
        if (response.ok) {
          const parsedTitle =
            body?.metadata?.title || file.name.replace(/\.epub$/i, '')
          const authorList = Array.isArray(body?.metadata?.authors)
            ? body.metadata.authors
            : []
          const author =
            authorList.length > 0 ? authorList.join(', ') : undefined
          const language = body?.metadata?.language || undefined
          const bookId = await convex.mutation('books:createBook', {
            ownerId: userId,
            title: parsedTitle,
            author,
            language,
          })

          await convex.mutation('userBooks:upsertUserBook', {
            userId,
            bookId,
          })

          if (body?.sections && body?.chunks) {
            await convex.mutation('ingest:ingestParsedBook', {
              bookId,
              sections: body.sections,
              chunks: body.chunks,
            })
          }

          await convex.mutation('importJobs:updateImportJobStatus', {
            importJobId,
            status: 'completed',
            bookId,
          })
        } else {
          await convex.mutation('importJobs:updateImportJobStatus', {
            importJobId,
            status: 'failed',
            errorMessage: body?.error ?? 'Parser error',
          })
        }

        return json(
          { importJobId, userId, parser: body },
          { status: response.status },
        )
      },
    },
  },
})
