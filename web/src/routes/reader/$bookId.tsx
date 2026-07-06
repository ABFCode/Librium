import { createFileRoute } from '@tanstack/react-router'
import { ReaderExperience } from '../../components/ReaderExperience'

export const Route = createFileRoute('/reader/$bookId')({
  component: ReaderRailRoute,
  // The reader owns the full viewport — its own top bar has the way back,
  // so the app header is suppressed for any route that opts out of chrome.
  staticData: { chrome: false },
})

function ReaderRailRoute() {
  const { bookId } = Route.useParams()
  return <ReaderExperience bookId={bookId} />
}
