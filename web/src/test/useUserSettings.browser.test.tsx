import { renderHook } from 'vitest-browser-react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useUserSettings } from '../hooks/useUserSettings'

let authState = { isAuthenticated: false }
let settingsState: {
  fontScale?: number
  lineHeight?: number
  contentWidth?: number
  theme?: string
} | undefined
const saveSettings = vi.fn()

vi.mock('convex/react', () => ({
  useConvexAuth: () => authState,
  useQuery: () => settingsState,
  useMutation: () => saveSettings,
}))

describe('useUserSettings', () => {
  beforeEach(() => {
    authState = { isAuthenticated: false }
    settingsState = undefined
    saveSettings.mockReset()
    localStorage.clear()
    document.body.dataset.theme = ''
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('persists theme locally when signed out', async () => {
    const { result, act } = await renderHook(() => useUserSettings())

    await act(() => {
      result.current.setTheme('paper')
    })

    expect(document.body.dataset.theme).toBe('paper')
    expect(localStorage.getItem('librium_theme')).toBe('paper')
  })

  it('saves settings when signed in after debounce', async () => {
    authState = { isAuthenticated: true }
    settingsState = {
      fontScale: 0,
      lineHeight: 1.7,
      contentWidth: 720,
      theme: 'night',
    }

    const { result, act } = await renderHook(() => useUserSettings())

    await act(() => {})

    await act(() => {
      result.current.setTheme('sepia')
    })

    expect(saveSettings).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'sepia' }),
    )
  })
})
