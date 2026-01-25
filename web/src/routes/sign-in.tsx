import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { authClient } from '../lib/auth-client'

export const Route = createFileRoute('/sign-in')({
  component: SignIn,
})

function SignIn() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const submit = async () => {
    setError(null)
    setIsLoading(true)
    try {
      const result = await authClient.signIn.email({
        email,
        password,
        fetchOptions: { throw: false },
      })
      if (result?.error) {
        setError(result.error.message || 'Unable to sign in')
        return
      }
      navigate({ to: '/library' })
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'data' in err
          ? JSON.stringify(err.data)
          : err instanceof Error
            ? err.message
            : 'Unable to sign in'
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
            <span className="pill">Member Access</span>
            <h1 className="mt-6 text-4xl leading-tight">
              Step into your private reading lounge.
            </h1>
            <p className="mt-4 text-sm text-[var(--muted)]">
              Librium keeps your personal library synchronized, beautiful, and
              fast. Sign in to continue where you left off.
            </p>
          </div>
          <div className="mt-10 grid gap-4 text-sm text-[var(--muted)]">
            <div className="surface-soft rounded-2xl p-4">
              <div className="text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
                Focus Mode
              </div>
              <div className="mt-2 text-base text-[var(--ink)]">
                Distraction-free layouts tuned for long reading sessions.
              </div>
            </div>
            <div className="surface-soft rounded-2xl p-4">
              <div className="text-xs uppercase tracking-[0.3em] text-[var(--accent-2)]">
                Sync & Resume
              </div>
              <div className="mt-2 text-base text-[var(--ink)]">
                Your progress stays with you across every device.
              </div>
            </div>
          </div>
        </div>

        <div className="surface flex flex-col justify-center rounded-[28px] p-8">
          <h2 className="text-2xl">Sign in</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Use the email tied to your Librium account.
          </p>
          <div className="mt-6 space-y-4">
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
              disabled={isLoading || !email || !password}
            >
              {isLoading ? 'Signing in...' : 'Enter Librium'}
            </button>
            {error ? (
              <p className="text-sm text-[var(--danger)]">{error}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
