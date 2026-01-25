import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'

type RequireAuthProps = {
  children: React.ReactNode
}

export const RequireAuth = ({ children }: RequireAuthProps) => {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const allowLocalAuth =
    import.meta.env.VITE_ALLOW_LOCAL_AUTH === 'true'

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !allowLocalAuth) {
      navigate({ to: '/sign-in' })
    }
  }, [isAuthenticated, isLoading, navigate, allowLocalAuth])

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

  if (!isAuthenticated && !allowLocalAuth) {
    return null
  }

  return <>{children}</>
}
