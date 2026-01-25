import { useEffect } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useLocalUser } from '../hooks/useLocalUser'

export function ThemeSync() {
  const userId = useLocalUser()
  const settings = useQuery(
    api.userSettings.getByUser,
    userId ? { userId } : 'skip',
  )

  useEffect(() => {
    if (!userId) {
      const stored = localStorage.getItem('librium_theme')
      if (stored) {
        document.body.dataset.theme = stored
      }
      return
    }
    const theme = settings?.theme ?? 'night'
    document.body.dataset.theme = theme
  }, [settings?.theme, userId])

  return null
}
