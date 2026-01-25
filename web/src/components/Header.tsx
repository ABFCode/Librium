import { Link } from '@tanstack/react-router'
import { authClient } from '../lib/auth-client'

export default function Header() {
  const { data: session } = authClient.useSession()
  const user = session?.user
  const allowLocalAuth =
    import.meta.env.VITE_ALLOW_LOCAL_AUTH === 'true'
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 px-4 py-3 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 text-sm font-semibold">
        <div className="flex items-center gap-4">
          <Link className="text-slate-100 hover:text-sky-300" to="/">
            Home
          </Link>
          <Link className="text-slate-100 hover:text-sky-300" to="/library">
            Library
          </Link>
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-xs text-slate-400">
                {user.email ?? user.name ?? 'Signed in'}
              </span>
              <button
                className="text-xs font-semibold text-slate-200 hover:text-sky-300"
                onClick={() => authClient.signOut()}
              >
                Sign out
              </button>
            </>
          ) : allowLocalAuth ? (
            <span className="text-xs text-slate-400">Local auth</span>
          ) : (
            <>
              <Link
                className="text-xs font-semibold text-slate-200 hover:text-sky-300"
                to="/sign-in"
              >
                Sign in
              </Link>
              <Link
                className="text-xs font-semibold text-sky-300 hover:text-sky-200"
                to="/sign-up"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}
