import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useLocalUser } from '../hooks/useLocalUser'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

export const Route = createFileRoute('/')({ component: App })

function App() {
  const userId = useLocalUser()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<unknown | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const importJobs = useQuery(
    api.importJobs.listImportJobs,
    userId ? { userId } : 'skip',
  )

  const submit = async () => {
    if (!file) {
      setError('Select an EPUB file first.')
      return
    }
    if (!userId) {
      setError('User not ready yet.')
      return
    }
    setIsUploading(true)
    setError(null)
    setResult(null)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('userId', userId)
    const response = await fetch('/api/import', {
      method: 'POST',
      body: formData,
    })
    const body = await response.json()
    if (!response.ok) {
      setError(body?.error ?? 'Upload failed')
    } else {
      setResult(body)
    }
    setIsUploading(false)
  }

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
          <h1 className="text-2xl font-semibold text-white">
            Librium Import
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Upload an EPUB to run through the parser service.
          </p>
          <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center">
            <input
              className="w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-200 file:mr-4 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-1 file:text-sm file:text-slate-200"
              type="file"
              accept=".epub,application/epub+zip"
              onChange={(event) =>
                setFile(event.target.files?.[0] ?? null)
              }
            />
            <button
              className="inline-flex items-center justify-center rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
              onClick={submit}
              disabled={isUploading || !file}
            >
              {isUploading ? 'Uploading...' : 'Import EPUB'}
            </button>
          </div>
          {error ? (
            <p className="mt-3 text-sm text-rose-400">{error}</p>
          ) : null}
          {result ? (
            <pre className="mt-4 rounded-lg bg-slate-950 p-4 text-xs text-slate-200">
              {JSON.stringify(result, null, 2)}
            </pre>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Recent Imports
            </h2>
            <Link className="text-sm text-sky-300" to="/library">
              Go to Library
            </Link>
          </div>
          {!importJobs ? (
            <p className="mt-4 text-sm text-slate-400">
              Loading imports...
            </p>
          ) : importJobs.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">
              No imports yet.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {importJobs.map((job) => (
                <div
                  key={job._id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 md:flex-row md:items-center"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-100">
                      {job.fileName}
                    </div>
                    <div className="text-xs uppercase tracking-widest text-slate-400">
                      {job.status}
                    </div>
                  </div>
                  <div>
                    {job.bookId ? (
                      <Link
                        className="text-sm font-semibold text-sky-300 hover:text-sky-200"
                        to="/reader/$bookId"
                        params={{ bookId: job.bookId }}
                      >
                        Open reader
                      </Link>
                    ) : (
                      <span className="text-xs uppercase tracking-widest text-slate-500">
                        No book
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
