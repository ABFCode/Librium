import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { authClient } from '../lib/auth-client'
import { useUserSettings } from '../hooks/useUserSettings'
import { Icon } from './Icon'

export default function Header() {
  const { data: session } = authClient.useSession()
  const user = session?.user
  const { isAuthenticated } = useConvexAuth()
  const ensureViewer = useMutation(api.users.ensureViewer)
  // Hide the sign-up link when registration is closed on this instance.
  const signupEnabled = useQuery(api.config.signupEnabled)
  const showNav = Boolean(user)
  const { theme, setTheme } = useUserSettings()

  useEffect(() => {
    if (isAuthenticated) {
      void ensureViewer({})
    }
  }, [isAuthenticated, ensureViewer])
  const toggleTheme = () => {
    const next = theme === 'paper' ? 'night' : 'paper'
    setTheme(next)
  }
  return (
    <header className="app-header sticky top-0 z-40 px-4 py-3 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link className="flex items-center gap-2.5" to="/">
            <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] font-[family-name:var(--font-display)] text-base font-semibold text-[var(--accent)]">
              L
            </div>
            <div className="font-[family-name:var(--font-display)] text-lg font-semibold">
              Librium
            </div>
          </Link>
          {showNav ? (
            <div className="hidden items-center gap-1 text-sm font-medium text-[var(--muted-2)] md:flex">
              <Link
                className="rounded-[var(--radius-sm)] px-2.5 py-1 transition hover:text-[var(--ink)]"
                to="/library"
                activeProps={{ className: 'text-[var(--ink)]' }}
              >
                Library
              </Link>
              <Link
                className="rounded-[var(--radius-sm)] px-2.5 py-1 transition hover:text-[var(--ink)]"
                to="/import"
                activeProps={{ className: 'text-[var(--ink)]' }}
              >
                Upload
              </Link>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="icon-btn tooltip"
            data-tooltip="Toggle theme"
            data-tooltip-position="bottom"
            onClick={toggleTheme}
          >
            <span className="sr-only">Toggle theme</span>
            {theme === 'paper' ? (
              <Icon name="sun" />
            ) : (
              <Icon name="moon" />
            )}
          </button>
          {user ? (
            <>
              <span className="hidden text-sm text-[var(--muted-2)] md:inline">
                {user.email ?? user.name ?? 'Signed in'}
              </span>
              <button
                className="btn btn-ghost text-xs"
                onClick={() => authClient.signOut()}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link className="btn btn-ghost text-xs" to="/sign-in">
                Sign in
              </Link>
              {signupEnabled === false ? null : (
                <Link className="btn btn-primary text-xs" to="/sign-up">
                  Sign up
                </Link>
              )}
            </>
          )}
        </div>
      </nav>
    </header>
  )
}
