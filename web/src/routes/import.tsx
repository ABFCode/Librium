import { createFileRoute } from '@tanstack/react-router'
import { RequireAuth } from '../components/RequireAuth'
import { useImportFlow } from '../hooks/useImportFlow'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'

export const Route = createFileRoute('/import')({
  component: ImportPage,
})

function ImportPage() {
  const {
    files,
    isDragging,
    setIsDragging,
    result,
    error,
    isUploading,
    importJobs,
    isAuthenticated,
    allowLocalAuth,
    canUpload,
    statusLabel,
    submit,
    addFiles,
  } = useImportFlow()
  const clearJobs = useMutation(api.importJobs.clearImportJobs)

  return (
    <RequireAuth>
      <div className="min-h-screen px-6 pb-16 pt-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
          <div className="surface flex flex-wrap items-center justify-between gap-6 rounded-[28px] p-6">
            <div>
              <h1 className="text-3xl">Add books</h1>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Drop EPUBs or choose files.
              </p>
            </div>
          </div>

          <section className="card p-6">
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div>
                <div
                  className={`flex min-h-[220px] flex-col items-center justify-center rounded-3xl border border-dashed px-6 py-10 text-center text-sm transition ${
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
                  <p className="text-base font-semibold">Drop EPUBs</p>
                  <p className="mt-2 text-xs text-[var(--muted-2)]">
                    {files.length > 0
                      ? `${files.length} file(s) queued`
                      : 'or choose files below'}
                  </p>
                </div>

                <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
                  <label className="upload-control w-full md:w-auto">
                    <span className="upload-label">
                      <span className="upload-icon" aria-hidden="true">
                        <svg
                          aria-hidden="true"
                          xmlns="http://www.w3.org/2000/svg"
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 5v14" />
                          <path d="M5 12h14" />
                        </svg>
                      </span>
                      Choose files
                    </span>
                    <span className="upload-meta">
                      {files.length > 0 ? `${files.length} selected` : 'EPUB only'}
                    </span>
                    <input
                      className="upload-input"
                      type="file"
                      multiple
                      accept=".epub,application/epub+zip"
                      onChange={(event) => {
                        if (event.target.files) {
                          addFiles(event.target.files)
                        }
                      }}
                    />
                  </label>
                  <button
                    className="btn btn-primary w-full md:w-auto"
                    onClick={submit}
                    disabled={
                      isUploading ||
                      files.length === 0 ||
                      (!isAuthenticated && !allowLocalAuth)
                    }
                  >
                    {isUploading ? `Uploading ${files.length} file(s)...` : 'Upload'}
                  </button>
                </div>

                {error ? (
                  <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>
                ) : null}
                {files.length > 0 ? (
                  <div className="mt-4 rounded-2xl border border-white/5 bg-[rgba(12,15,18,0.6)] px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted-2)]">
                      Selected files
                    </div>
                    <ul className="mt-2 space-y-1 text-xs text-[var(--ink)]">
                      {files.map((file) => (
                        <li
                          key={`${file.name}-${file.size}`}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="truncate">{file.name}</span>
                          <span className="text-[var(--muted-2)]">
                            {Math.round(file.size / 1024)} KB
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {!isAuthenticated && !allowLocalAuth ? (
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
              </div>

              <div className="surface-soft rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-[0.35em] text-[var(--accent-3)]">
                    Recent
                  </div>
                  {isAuthenticated || allowLocalAuth ? (
                    <button
                      className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted-2)] hover:text-[var(--ink)]"
                      onClick={() => clearJobs({})}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                {!importJobs ? (
                  <p className="mt-3 text-sm text-[var(--muted)]">Loading uploads...</p>
                ) : importJobs.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--muted)]">No uploads yet.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {importJobs.map((job) => (
                      <div
                        key={job._id}
                        className="flex items-center justify-between gap-4 rounded-2xl border border-white/5 bg-[rgba(12,15,18,0.6)] px-3 py-2 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold">{job.fileName}</div>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.25em] ${
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
                          {statusLabel(job.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </RequireAuth>
  )
}
