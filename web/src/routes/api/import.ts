import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { enqueueImport } from '../../server/importQueue'

const parserUrl = process.env.PARSER_URL ?? 'http://localhost:8081/parse'
const convexUrl = process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL
const allowLocalAuth =
  process.env.VITE_ALLOW_LOCAL_AUTH === 'true' ||
  process.env.ALLOW_LOCAL_AUTH === 'true'
const allowServerImports =
  process.env.ALLOW_SERVER_IMPORTS === 'true' ||
  process.env.NODE_ENV !== 'production'

const getConvexUrl = () => {
  if (!convexUrl) {
    throw new Error('Missing Convex URL. Set VITE_CONVEX_URL or CONVEX_URL.')
  }
  return convexUrl
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

        const convexUrlValue = getConvexUrl()
        const { ConvexHttpClient } = await import('convex/browser')
        const convex = new ConvexHttpClient(convexUrlValue)
        const providedUserId = formData.get('userId')
        let userId =
          typeof providedUserId === 'string' && providedUserId.length > 0
            ? providedUserId
            : null
        if (!userId) {
          if (!allowLocalAuth && !allowServerImports) {
            return json({ error: 'Unauthenticated' }, { status: 401 })
          }
          userId = await convex.mutation('users:upsertUser', {
            authProvider: 'local',
            externalId: 'local-dev',
            name: 'Local Dev',
          })
        }

        const uploadUrl = await convex.mutation(
          'storage:generateUploadUrl',
          {},
        )
        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          body: file,
        })
        const uploadBody = await uploadResponse.json()
        const storageId = uploadBody.storageId

        const importJobId = await convex.mutation(
          'importJobs:createImportJob',
          {
            userId,
            fileName: file.name,
            fileSize: file.size,
            contentType: file.type || undefined,
            storageId,
          },
        )

        enqueueImport(
          {
            importJobId,
            userId,
            fileName: file.name,
            fileSize: file.size,
            contentType: file.type || undefined,
            storageId,
          },
          convexUrlValue,
          parserUrl,
        )

        return json(
          { importJobId, userId, status: 'queued', fileName: file.name },
          { status: 202 },
        )
      },
    },
  },
})
