import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

const parserUrl =
  process.env.PARSER_URL ?? 'http://localhost:8081/parse'

export const Route = createFileRoute('/api/import')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const formData = await request.formData()
        const file = formData.get('file')

        if (!(file instanceof File)) {
          return json({ error: 'Missing file' }, { status: 400 })
        }

        const parserForm = new FormData()
        parserForm.append('file', file, file.name)

        const response = await fetch(parserUrl, {
          method: 'POST',
          body: parserForm,
        })

        const body = await response.json()
        return json(body, { status: response.status })
      },
    },
  },
})
