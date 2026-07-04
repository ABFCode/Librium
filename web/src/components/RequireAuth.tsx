import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'

// Remembers that this device was signed in, so local-first content can render
// while offline (Convex cannot confirm auth without a connection). Cleared on
// a confirmed online sign-out.
const WAS_AUTHENTICATED_KEY = 'librium:wasAuthenticated'

type RequireAuthProps = {
  children: React.ReactNode
}

export const RequireAuth = ({ children }: RequireAuthProps) => {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
  const wasAuthenticated =
    typeof window !== 'undefined' &&
    window.localStorage.getItem(WAS_AUTHENTICATED_KEY) === 'true'

  useEffect(() => {
    if (isAuthenticated) {
      window.localStorage.setItem(WAS_AUTHENTICATED_KEY, 'true')
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isOffline) {
      window.localStorage.removeItem(WAS_AUTHENTICATED_KEY)
      navigate({ to: '/sign-in' })
    }
  }, [isAuthenticated, isLoading, navigate, isOffline])

  // Offline grace: auth cannot resolve without the server. If this device was
  // previously signed in, render — content comes from IndexedDB and every
  // Convex-dependent feature degrades gracefully.
  if (!isAuthenticated && isOffline && wasAuthenticated) {
    return <>{children}</>
  }

  if (isLoading) {
    return (
      <div className="min-h-screen px-6 py-10">
        <div className="mx-auto w-full max-w-5xl">
          <div className="surface-soft animate-pulse rounded-2xl p-6">
            <div className="h-3 w-32 rounded-full bg-white/10" />
            <div className="mt-3 h-3 w-48 rounded-full bg-white/5" />
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return <>{children}</>
}
