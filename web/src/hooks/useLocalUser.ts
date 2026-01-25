import { useEffect, useState } from 'react'
import type { Id } from 'convex/values'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

const STORAGE_KEY = 'librium_user_id'

export const useLocalUser = () => {
  const upsertUser = useMutation(api.users.upsertUser)
  const authUser = useQuery(api.auth.getCurrentUser, {})
  const [userId, setUserId] = useState<Id<'users'> | null>(null)
  const allowLocalAuth =
    import.meta.env.VITE_ALLOW_LOCAL_AUTH === 'true'

  useEffect(() => {
    if (authUser) {
      const externalId =
        authUser.id ??
        authUser.userId ??
        authUser.sub ??
        (authUser as { user?: { id?: string } }).user?.id ??
        authUser.email ??
        (authUser as { user?: { email?: string } }).user?.email ??
        'unknown'
      upsertUser({
        authProvider: 'better-auth',
        externalId,
        email: authUser.email ?? undefined,
        name: authUser.name ?? undefined,
      }).then(setUserId)
      return
    }

    if (allowLocalAuth) {
      const cached = localStorage.getItem(STORAGE_KEY)
      if (cached) {
        setUserId(cached as Id<'users'>)
        return
      }

      upsertUser({
        authProvider: 'local',
        externalId: 'local-dev',
        name: 'Local Dev',
      }).then((id) => {
        localStorage.setItem(STORAGE_KEY, id)
        setUserId(id)
      })
    }
  }, [authUser, upsertUser, allowLocalAuth])

  return userId
}
