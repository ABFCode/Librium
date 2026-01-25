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
    <div className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h1 className="text-2xl font-semibold text-white">
          Create an account
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Sign up with email and password.
        </p>
        <div className="mt-6 space-y-4">
          <input
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-200"
            type="text"
            placeholder="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-200"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-200"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            className="w-full rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
            onClick={submit}
            disabled={isLoading || !name || !email || !password}
          >
            {isLoading ? 'Creating account...' : 'Sign up'}
          </button>
          {error ? (
            <p className="text-sm text-rose-400">{error}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
