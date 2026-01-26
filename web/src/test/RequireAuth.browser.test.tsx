import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from 'vitest-browser-react'
import { RequireAuth } from '../components/RequireAuth'

const navigate = vi.fn()
let authState = { isAuthenticated: false, isLoading: false }

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('convex/react', () => ({
  useConvexAuth: () => authState,
}))

describe('RequireAuth', () => {
  beforeEach(() => {
    navigate.mockReset()
    authState = { isAuthenticated: false, isLoading: false }
  })

  it('redirects when signed out', async () => {
    const screen = await render(
      <RequireAuth>
        <div>Secret</div>
      </RequireAuth>,
    )

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(navigate).toHaveBeenCalledWith({ to: '/sign-in' })
    expect(screen.container.textContent).not.toContain('Secret')
  })

  it('renders children when signed in', async () => {
    authState = { isAuthenticated: true, isLoading: false }
    const screen = await render(
      <RequireAuth>
        <div>Secret</div>
      </RequireAuth>,
    )

    expect(screen.container.textContent).toContain('Secret')
  })
})
