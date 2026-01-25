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
      <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-200">
        <div className="mx-auto w-full max-w-5xl">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated && !allowLocalAuth) {
    return null
  }

  return <>{children}</>
}
