import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useConvexAuth } from 'convex/react'

export const Route = createFileRoute('/')({ component: Landing })

function Landing() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading } = useConvexAuth()

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate({ to: '/library' })
    }
  }, [isAuthenticated, isLoading, navigate])

  if (isLoading || isAuthenticated) {
    return (
      <div className="min-h-screen px-6 py-16">
        <div className="mx-auto w-full max-w-5xl text-sm text-[var(--muted)]">
          Preparing your library...
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-6 pb-20 pt-14">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-12">
        <section className="surface rounded-[28px] p-10 text-center">
          <span className="pill">Librium</span>
          <h1 className="mt-6 text-5xl leading-tight">
            Your personal reading studio.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[var(--muted)]">
            Librium is a private EPUB library with fast parsing, clean
            navigation, and progress synced to your account. Upload your own
            books and read without noise.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link className="btn btn-primary" to="/sign-in">
              Sign in
            </Link>
            <Link className="btn btn-ghost" to="/sign-up">
              Create account
            </Link>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: 'Bring your EPUBs',
              body: 'Upload your personal collection and keep it organized.',
            },
            {
              title: 'Read with focus',
              body: 'A distraction-free reader with instant section jumps.',
            },
            {
              title: 'Sync progress',
              body: 'Your position travels with you across devices.',
            },
          ].map((item) => (
            <div key={item.title} className="surface-soft rounded-2xl p-6">
              <div className="text-xs uppercase tracking-[0.35em] text-[var(--accent)]">
                {item.title}
              </div>
              <p className="mt-3 text-sm text-[var(--muted)]">{item.body}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
