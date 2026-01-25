import { useEffect, useRef, useState } from 'react'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

const STORAGE_KEY = 'librium_theme'

type UserSettingsState = {
  fontScale: number
  lineHeight: number
  contentWidth: number
  theme: string
}

const defaults: UserSettingsState = {
  fontScale: 0,
  lineHeight: 1.7,
  contentWidth: 720,
  theme: 'night',
}

export const useUserSettings = (options?: { pauseSync?: boolean }) => {
  const { isAuthenticated } = useConvexAuth()
  const allowLocalAuth = import.meta.env.VITE_ALLOW_LOCAL_AUTH === 'true'
  const canQuery = isAuthenticated || allowLocalAuth
  const settings = useQuery(
    api.userSettings.getByUser,
    canQuery ? {} : 'skip',
  )
  const saveSettings = useMutation(api.userSettings.upsert)
  const [state, setState] = useState<UserSettingsState>(defaults)
  const lastSavedRef = useRef<UserSettingsState | null>(null)
  const hydratedRef = useRef(false)

  useEffect(() => {
    if (options?.pauseSync) {
      return
    }
    const storedTheme =
      typeof window !== 'undefined'
        ? localStorage.getItem(STORAGE_KEY)
        : null
    const next: UserSettingsState = {
      fontScale: settings?.fontScale ?? defaults.fontScale,
      lineHeight: settings?.lineHeight ?? defaults.lineHeight,
      contentWidth: settings?.contentWidth ?? defaults.contentWidth,
      theme: settings?.theme ?? storedTheme ?? defaults.theme,
    }
    setState(next)
    lastSavedRef.current = next
    hydratedRef.current = true
  }, [settings, options?.pauseSync])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }
    document.body.dataset.theme = state.theme
  }, [state.theme])

  useEffect(() => {
    if (!canQuery) {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, state.theme)
      }
      return
    }
    if (!hydratedRef.current) {
      return
    }
    const last = lastSavedRef.current
    const changed =
      !last ||
      last.fontScale !== state.fontScale ||
      last.lineHeight !== state.lineHeight ||
      last.contentWidth !== state.contentWidth ||
      last.theme !== state.theme
    if (!changed) {
      return
    }
    const timeout = window.setTimeout(() => {
      void saveSettings(state)
      lastSavedRef.current = state
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [canQuery, saveSettings, state])

  return {
    ...state,
    setFontScale: (value: number | ((prev: number) => number)) =>
      setState((prev) => ({
        ...prev,
        fontScale: typeof value === 'function' ? value(prev.fontScale) : value,
      })),
    setLineHeight: (value: number) =>
      setState((prev) => ({ ...prev, lineHeight: value })),
    setContentWidth: (value: number) =>
      setState((prev) => ({ ...prev, contentWidth: value })),
    setTheme: (value: string) =>
      setState((prev) => ({ ...prev, theme: value })),
  }
}
