import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render } from 'vitest-browser-react'
import Header from '../components/Header'

let authState = { isAuthenticated: false }
let sessionUser: { email?: string; name?: string } | null = null
// config.signupEnabled result: undefined while loading, true/false once known.
let signupEnabled: boolean | undefined = undefined
const ensureViewer = vi.fn()
const setTheme = vi.fn()

vi.mock('convex/react', () => ({
  useConvexAuth: () => authState,
  useMutation: () => ensureViewer,
  useQuery: () => signupEnabled,
}))

vi.mock('@tanstack/react-router', () => ({
  // Strip router-only props (activeProps) so they don't hit the DOM.
  Link: ({
    children,
    activeProps: _activeProps,
    ...props
  }: {
    children: ReactNode
    activeProps?: Record<string, string>
  }) => <a {...props}>{children}</a>,
}))

vi.mock('../hooks/useUserSettings', () => ({
  useUserSettings: () => ({ theme: 'paper', setTheme }),
}))

vi.mock('../lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: sessionUser ? { user: sessionUser } : null }),
    signOut: vi.fn(),
  },
}))

describe('Header', () => {
  beforeEach(() => {
    authState = { isAuthenticated: false }
    sessionUser = null
    signupEnabled = undefined
    ensureViewer.mockReset()
    setTheme.mockReset()
  })

  it('shows auth actions when signed out', async () => {
    const screen = await render(<Header />)

    await expect.element(screen.getByText('Sign in')).toBeVisible()
    await expect.element(screen.getByText('Sign up')).toBeVisible()
  })

  it('hides sign up when registration is closed', async () => {
    signupEnabled = false
    const screen = await render(<Header />)

    await expect.element(screen.getByText('Sign in')).toBeVisible()
    expect(screen.container.textContent).not.toContain('Sign up')
  })

  it('shows navigation and ensures viewer when signed in', async () => {
    authState = { isAuthenticated: true }
    sessionUser = { email: 'reader@example.com' }

    const screen = await render(<Header />)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(ensureViewer).toHaveBeenCalledWith({})
    await expect.element(screen.getByText('Library')).toBeVisible()
    await expect.element(screen.getByText('Upload')).toBeVisible()
    await expect.element(screen.getByText('Sign out')).toBeVisible()
  })

  it('toggles theme', async () => {
    const screen = await render(<Header />)
    await screen.getByRole('button', { name: 'Toggle theme' }).click()

    expect(setTheme).toHaveBeenCalledWith('night')
  })
})
