import { createFileRoute } from '@tanstack/react-router'
import { ReaderExperience } from '../../components/ReaderExperience'

export const Route = createFileRoute('/reader/$bookId')({
  component: ReaderRailRoute,
})

function ReaderRailRoute() {
  const { bookId } = Route.useParams()
  return <ReaderExperience bookId={bookId} />
}
