import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useLocalUser } from '../hooks/useLocalUser'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

export const Route = createFileRoute('/')({ component: App })

function App() {
  const userId = useLocalUser()
  const [files, setFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [result, setResult] = useState<{
    fileName: string
    fileSize: number
    author: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const importJobs = useQuery(
    api.importJobs.listImportJobs,
    userId ? { userId } : 'skip',
  )
  const books = useQuery(
    api.books.listByOwner,
    userId ? { ownerId: userId } : 'skip',
  )
  const coverUrls = useQuery(
    api.books.getCoverUrls,
    books ? { bookIds: books.map((book) => book._id) } : 'skip',
  )
  const allowLocalAuth =
    import.meta.env.VITE_ALLOW_LOCAL_AUTH === 'true'

  const submit = async () => {
    if (files.length === 0) {
      setError('Select at least one EPUB file.')
      return
    }
    if (!userId) {
      setError('Please sign in to upload books.')
      return
    }
    setIsUploading(true)
    setError(null)
    setResult(null)
    for (const file of files) {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('userId', userId)
      const response = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      })
      const body = await response.json()
      if (!response.ok) {
        setError(body?.error ?? `Upload failed for ${file.name}`)
        continue
      }
      const author = 'Queued for parsing'
      const title = body?.fileName ?? file.name
      setResult({
        fileName: title,
        fileSize: body?.parser?.fileSize ?? file.size,
        author,
      })
    }
    setIsUploading(false)
  }

  const addFiles = (incoming: FileList | File[]) => {
    const next = Array.from(incoming).filter((file) =>
      file.name.toLowerCase().endsWith('.epub'),
    )
    if (next.length === 0) {
      setError('Only EPUB files are supported.')
      return
    }
    setFiles((prev) => [...prev, ...next])
  }

  return (
    <div className="min-h-screen px-6 pb-16 pt-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <div className="surface flex flex-wrap items-center justify-between gap-6 rounded-[28px] p-6">
          <div>
            <span className="pill">Library</span>
            <h1 className="mt-3 text-3xl">Your shelves come first.</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Browse your collection, then queue new EPUBs when you need.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link className="btn btn-ghost" to="/library">
              Open Library
            </Link>
            <a className="btn btn-primary" href="#import">
              Add EPUBs
            </a>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <section className="card p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl">Library focus</h2>
              <span className="pill">Collection</span>
            </div>
            {!books ? (
              <p className="mt-6 text-sm text-[var(--muted)]">
                Loading library...
              </p>
            ) : books.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-[rgba(12,15,18,0.6)] p-6 text-sm text-[var(--muted)]">
                Your library is empty. Import your first EPUB on the right.
              </div>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {books.slice(0, 6).map((book, index) => (
                  <Link
                    key={book._id}
                    className="rounded-2xl border border-white/5 bg-[rgba(12,15,18,0.7)] p-4 transition hover:border-[rgba(209,161,92,0.5)]"
                    to="/reader/$bookId"
                    params={{ bookId: book._id }}
                  >
                    <div className="relative mb-3 h-28 overflow-hidden rounded-xl">
                      {coverUrls?.[book._id] ? (
                        <img
                          src={coverUrls[book._id] ?? undefined}
                          alt={book.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full bg-[linear-gradient(135deg,rgba(209,161,92,0.2),rgba(143,181,166,0.2))]" />
                      )}
                      <div className="absolute bottom-2 left-2 rounded-full border border-white/20 bg-black/30 px-2 py-1 text-[9px] uppercase tracking-[0.3em] text-white/80">
                        Volume {index + 1}
                      </div>
                    </div>
                    <div className="mt-2 text-base font-semibold">
                      {book.title}
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {book.author ?? 'Unknown author'}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section id="import" className="card p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl">Queue imports</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  EPUB only. Keep the pipeline clean.
                </p>
              </div>
              <span className="pill">Parser</span>
            </div>
            <div className="mt-6 flex flex-col gap-4">
              <div
                className={`flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-8 text-center text-sm transition ${
                  isDragging
                    ? 'border-[var(--accent)] bg-[rgba(209,161,92,0.12)] text-[var(--accent)]'
                    : 'border-white/10 bg-[rgba(9,12,15,0.6)] text-[var(--muted)]'
                }`}
                onDragEnter={(event) => {
                  event.preventDefault()
                  setIsDragging(true)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setIsDragging(false)
                  if (event.dataTransfer.files.length > 0) {
                    addFiles(event.dataTransfer.files)
                  }
                }}
              >
                <p className="text-base font-semibold">
                  Drag & drop EPUBs here
                </p>
                <p className="mt-2 text-xs text-[var(--muted-2)]">
                  {files.length} queued for upload.
                </p>
              </div>
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <input
                  className="input cursor-pointer file:mr-4 file:rounded-full file:border-0 file:bg-[rgba(245,239,230,0.1)] file:px-4 file:py-2 file:text-xs file:uppercase file:tracking-[0.3em] file:text-[var(--muted)]"
                  type="file"
                  multiple
                  accept=".epub,application/epub+zip"
                  onChange={(event) => {
                    if (event.target.files) {
                      addFiles(event.target.files)
                    }
                  }}
                />
                <button
                  className="btn btn-primary w-full md:w-auto"
                  onClick={submit}
                  disabled={
                    isUploading ||
                    files.length === 0 ||
                    (!userId && !allowLocalAuth)
                  }
                >
                  {isUploading
                    ? `Uploading ${files.length} file(s)...`
                    : 'Queue Import'}
                </button>
              </div>
            </div>
            {files.length > 0 ? (
              <div className="mt-4 text-xs text-[var(--muted)]">
                Selected: {files.length} file(s)
              </div>
            ) : null}
            {error ? (
              <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>
            ) : null}
            {!userId && !allowLocalAuth ? (
              <p className="mt-2 text-xs text-[var(--muted)]">
                Sign in to upload and sync your library.
              </p>
            ) : null}
            {result ? (
              <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                <div className="font-semibold">{result.fileName}</div>
                <div className="text-xs text-emerald-100/80">
                  {Math.round(result.fileSize / 1024)} KB • {result.author}
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <section className="surface-soft rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs uppercase tracking-[0.35em] text-[var(--accent-3)]">
              Recent imports
            </div>
            <Link className="btn btn-outline text-xs" to="/library">
              View Library
            </Link>
          </div>
          {!importJobs ? (
            <p className="mt-4 text-sm text-[var(--muted)]">
              Loading imports...
            </p>
          ) : importJobs.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">
              No imports yet.
            </p>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {importJobs.map((job) => (
                <div
                  key={job._id}
                  className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-[rgba(12,15,18,0.7)] p-4"
                >
                  <div className="text-sm font-semibold">{job.fileName}</div>
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] ${
                      job.status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-200'
                        : job.status === 'failed'
                          ? 'bg-rose-500/20 text-rose-200'
                          : job.status === 'ingesting'
                            ? 'bg-[rgba(143,181,166,0.2)] text-[var(--accent-2)]'
                            : job.status === 'parsing'
                              ? 'bg-indigo-500/20 text-indigo-200'
                              : 'bg-white/5 text-[var(--muted)]'
                    }`}
                  >
                    {job.status}
                  </span>
                  <div className="flex items-center justify-between">
                    {job.bookId ? (
                      <Link
                        className="btn btn-ghost text-xs"
                        to="/reader/$bookId"
                        params={{ bookId: job.bookId }}
                      >
                        Open reader
                      </Link>
                    ) : job.status === 'failed' ? (
                      <button
                        className="btn btn-ghost text-xs text-[var(--danger)]"
                        onClick={async () => {
                          await fetch('/api/import-retry', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              importJobId: job._id,
                            }),
                          })
                        }}
                      >
                        Retry
                      </button>
                    ) : (
                      <span className="text-xs text-[var(--muted-2)]">
                        In queue
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
