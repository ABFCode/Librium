import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useConvexAuth, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { authClient } from '../lib/auth-client'
import { useUserSettings } from '../hooks/useUserSettings'

export default function Header() {
  const { data: session } = authClient.useSession()
  const user = session?.user
  const { isAuthenticated } = useConvexAuth()
  const ensureViewer = useMutation(api.users.ensureViewer)
  const allowLocalAuth =
    import.meta.env.VITE_ALLOW_LOCAL_AUTH === 'true'
  const showNav = Boolean(user) || allowLocalAuth
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
    <header className="app-header sticky top-0 z-40 px-4 py-4 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link className="flex items-center gap-3" to="/">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(209,161,92,0.5)] bg-[rgba(209,161,92,0.18)] text-lg font-semibold text-[var(--accent)]">
              L
            </div>
            <div className="text-lg font-semibold tracking-wide">
              Librium
            </div>
          </Link>
          {showNav ? (
            <div className="hidden items-center gap-4 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--muted-2)] md:flex">
              <Link className="hover:text-[var(--ink)]" to="/library">
                Library
              </Link>
              <Link className="hover:text-[var(--ink)]" to="/import">
                Upload
              </Link>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <button
            className="btn btn-ghost text-xs tooltip"
            data-tooltip="Toggle theme"
            data-tooltip-position="bottom"
            onClick={toggleTheme}
          >
            <span className="sr-only">Toggle theme</span>
            {theme === 'paper' ? (
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2" />
                <path d="M12 20v2" />
                <path d="M4.93 4.93l1.41 1.41" />
                <path d="M17.66 17.66l1.41 1.41" />
                <path d="M2 12h2" />
                <path d="M20 12h2" />
                <path d="M4.93 19.07l1.41-1.41" />
                <path d="M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          {user ? (
            <>
              <span className="hidden rounded-full border border-white/10 px-3 py-1 text-xs text-[var(--muted)] md:inline-flex">
                {user.email ?? user.name ?? 'Signed in'}
              </span>
              <button
                className="btn btn-ghost text-xs"
                onClick={() => authClient.signOut()}
              >
                Sign out
              </button>
            </>
          ) : allowLocalAuth ? (
            <span className="text-xs text-[var(--muted)]">Local auth</span>
          ) : (
            <>
              <Link className="btn btn-ghost text-xs" to="/sign-in">
                Sign in
              </Link>
              <Link className="btn btn-primary text-xs" to="/sign-up">
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}
