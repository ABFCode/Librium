import { Link } from '@tanstack/react-router'
import { authClient } from '../lib/auth-client'

export default function Header() {
  const { data: session } = authClient.useSession()
  const user = session?.user
  const allowLocalAuth =
    import.meta.env.VITE_ALLOW_LOCAL_AUTH === 'true'
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[rgba(8,10,12,0.9)] px-4 py-4 backdrop-blur">
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
          <div className="hidden items-center gap-4 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--muted-2)] md:flex">
            <Link className="hover:text-[var(--ink)]" to="/library">
              Library
            </Link>
            <Link className="hover:text-[var(--ink)]" to="/">
              Import
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
