import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { authClient } from '../lib/auth-client'

export const Route = createFileRoute('/sign-up')({
  component: SignUp,
})

function SignUp() {
  const navigate = useNavigate()
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
        setError(result.error.message || 'Unable to sign up')
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
        </div>
      </div>
    </div>
  )
}
