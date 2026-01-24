import { useEffect, useState } from 'react'
import type { Id } from 'convex/values'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'

const STORAGE_KEY = 'librium_user_id'

export const useLocalUser = () => {
  const upsertUser = useMutation(api.users.upsertUser)
  const [userId, setUserId] = useState<Id<'users'> | null>(null)

  useEffect(() => {
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
  }, [upsertUser])

  return userId
}
