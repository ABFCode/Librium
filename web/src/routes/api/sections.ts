import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

const sampleSections = [
  { id: 'section-1', title: 'Introduction', orderIndex: 0 },
  { id: 'section-2', title: 'Chapter 1', orderIndex: 1 },
  { id: 'section-3', title: 'Chapter 2', orderIndex: 2 },
]

export const Route = createFileRoute('/api/sections')({
  server: {
    handlers: {
      GET: () => json(sampleSections),
    },
  },
})
