import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { authClient } from '../lib/auth-client'

export const Route = createFileRoute('/sign-up')({
  component: SignUp,
})

function SignUp() {
  const navigate = useNavigate()
  // undefined while loading; false when registration is closed on this instance.
  const signupEnabled = useQuery(api.config.signupEnabled)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const submit = async () => {
    setError(null)
    setIsLoading(true)
    try {
      const result = await authClient.signUp.email({
        name,
        email,
        password,
        fetchOptions: { throw: false },
      })
      if (result?.error) {
        // Server rejects signup with this code when registration is closed.
        const message =
          result.error.code === 'EMAIL_PASSWORD_SIGN_UP_DISABLED'
            ? 'Registration is currently closed.'
            : result.error.message || 'Unable to sign up'
        setError(message)
        return
      }
      navigate({ to: '/library' })
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'data' in err
          ? JSON.stringify(err.data)
          : err instanceof Error
            ? err.message
            : 'Unable to sign up'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="surface flex flex-col justify-between rounded-[28px] p-8">
          <div>
            <span className="pill">New Volume</span>
            <h1 className="mt-6 text-4xl leading-tight">
              Build a library that feels handmade.
            </h1>
            <p className="mt-4 text-sm text-[var(--muted)]">
              Your collection stays yours. Upload, parse, and read without
              the clutter.
            </p>
          </div>
          <div className="mt-10 grid gap-4 text-sm text-[var(--muted)]">
            <div className="surface-soft rounded-2xl p-4">
              <div className="text-xs uppercase tracking-[0.3em] text-[var(--accent-3)]">
                Designed for focus
              </div>
              <div className="mt-2 text-base text-[var(--ink)]">
                Minimal, responsive layouts tuned for long-form reading.
              </div>
            </div>
            <div className="surface-soft rounded-2xl p-4">
              <div className="text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
                Own your library
              </div>
              <div className="mt-2 text-base text-[var(--ink)]">
                Your EPUBs live with you — no vendor lock-in.
              </div>
            </div>
          </div>
        </div>

        <div className="surface flex flex-col justify-center rounded-[28px] p-8">
          {signupEnabled === false ? (
            <>
              <h2 className="text-2xl">Registration is closed</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Librium isn't open for new accounts right now. If you already
                have an account, you can sign in.
              </p>
              <Link className="btn btn-primary mt-6 w-full" to="/sign-in">
                Go to sign in
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-2xl">Create an account</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Sign up with email and password.
              </p>
              <div className="mt-6 space-y-4">
                <input
                  className="input"
                  type="text"
                  placeholder="Name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <input
                  className="input"
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <input
                  className="input"
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  className="btn btn-primary w-full"
                  onClick={submit}
                  disabled={isLoading || !name || !email || !password}
                >
                  {isLoading ? 'Creating account...' : 'Create account'}
                </button>
                {error ? (
                  <p className="text-sm text-[var(--danger)]">{error}</p>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
