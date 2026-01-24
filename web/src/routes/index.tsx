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
    sections: number
    chunks: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const importJobs = useQuery(
    api.importJobs.listImportJobs,
    userId ? { userId } : 'skip',
  )

  const submit = async () => {
    if (files.length === 0) {
      setError('Select at least one EPUB file.')
      return
    }
    if (!userId) {
      setError('User not ready yet.')
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
      setResult({
        fileName: body?.parser?.fileName ?? file.name,
        fileSize: body?.parser?.fileSize ?? file.size,
        sections: body?.parser?.sections?.length ?? 0,
        chunks: body?.parser?.chunks?.length ?? 0,
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
    <div className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
          <h1 className="text-2xl font-semibold text-white">
            Librium Import
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Upload an EPUB to run through the parser service.
          </p>
          <div className="mt-6 flex flex-col gap-4">
            <div
              className={`flex min-h-[140px] flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center text-sm transition ${
                isDragging
                  ? 'border-sky-400 bg-sky-500/10 text-sky-200'
                  : 'border-slate-700 bg-slate-950/40 text-slate-300'
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
                Drag and drop EPUBs here
              </p>
              <p className="mt-1 text-xs text-slate-400">
                or use the file picker below
              </p>
            </div>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <input
                className="w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-200 file:mr-4 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-1 file:text-sm file:text-slate-200"
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
                className="inline-flex items-center justify-center rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
                onClick={submit}
                disabled={isUploading || files.length === 0}
              >
                {isUploading
                  ? `Uploading ${files.length} file(s)...`
                  : 'Import EPUB'}
              </button>
            </div>
          </div>
          {files.length > 0 ? (
            <div className="mt-4 text-xs text-slate-400">
              Selected: {files.length} file(s)
            </div>
          ) : null}
          {error ? (
            <p className="mt-3 text-sm text-rose-400">{error}</p>
          ) : null}
          {result ? (
            <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              <div className="font-semibold">{result.fileName}</div>
              <div className="text-xs text-emerald-100/80">
                {Math.round(result.fileSize / 1024)} KB •{' '}
                {result.sections} sections • {result.chunks} chunks
              </div>
            </div>
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
