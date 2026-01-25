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
    <div className="min-h-screen px-6 pb-16 pt-12">
      <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex flex-col gap-8">
          <div className="fade-in">
            <span className="pill">Parser Gateway</span>
            <h1 className="mt-6 text-5xl leading-tight">
              Bring your EPUBs into a calmer, faster library.
            </h1>
            <p className="mt-4 text-base text-[var(--muted)]">
              Librium turns raw EPUBs into structured sections with reliable
              metadata. Everything syncs, everything stays readable.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="surface-soft rounded-2xl p-5">
              <div className="text-xs uppercase tracking-[0.35em] text-[var(--accent-2)]">
                Ingestion
              </div>
              <div className="mt-3 text-lg">
                Streamlined import queue with clear status tracking.
              </div>
              <div className="mt-2 text-sm text-[var(--muted)]">
                Monitor parsing, ingestion, and reader availability.
              </div>
            </div>
            <div className="surface-soft rounded-2xl p-5">
              <div className="text-xs uppercase tracking-[0.35em] text-[var(--accent)]">
                Structure
              </div>
              <div className="mt-3 text-lg">
                Hierarchical TOC and chunked text for instant navigation.
              </div>
              <div className="mt-2 text-sm text-[var(--muted)]">
                Built for quick jumps and long-form focus.
              </div>
            </div>
          </div>
          <div className="surface-soft rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.35em] text-[var(--accent-3)]">
                  Recent Imports
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Watch the latest uploads flow through the pipeline.
                </p>
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
              <div className="mt-6 space-y-4">
                {importJobs.map((job) => (
                  <div
                    key={job._id}
                    className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-[rgba(12,15,18,0.7)] p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="text-sm font-semibold">
                        {job.fileName}
                      </div>
                      <div className="mt-2 text-xs uppercase tracking-[0.3em] text-[var(--muted-2)]">
                        Status
                      </div>
                      <div className="mt-1">
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
                      </div>
                    </div>
                    <div>
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
                          Retry import
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--muted-2)]">
                          Waiting
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl">Import EPUBs</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Drag, drop, and let the parser do the rest.
              </p>
            </div>
            <span className="pill">Beta</span>
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
                Drop EPUBs to queue parsing
              </p>
              <p className="mt-2 text-xs text-[var(--muted-2)]">
                Keep it simple: EPUB only, no DRM.
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
                  isUploading || files.length === 0 || (!userId && !allowLocalAuth)
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
    </div>
  )
}
