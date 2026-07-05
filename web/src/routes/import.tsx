import { createFileRoute } from '@tanstack/react-router'
import { RequireAuth } from '../components/RequireAuth'
import { useImportFlow, type QueueItem } from '../hooks/useImportFlow'
import { filesFromDataTransfer } from '../lib/fileTree'

export const Route = createFileRoute('/import')({
  component: ImportPage,
})

const statusChip = (item: QueueItem) => {
  switch (item.status) {
    case 'done':
      return 'bg-emerald-500/20 text-emerald-200'
    case 'failed':
      return 'bg-rose-500/20 text-rose-200'
    case 'importing':
      return 'bg-[rgba(143,181,166,0.2)] text-[var(--accent-2)]'
    default:
      return 'bg-white/5 text-[var(--muted)]'
  }
}

const statusLabel = (item: QueueItem) => {
  switch (item.status) {
    case 'done':
      return 'Ready'
    case 'failed':
      return 'Failed'
    case 'importing':
      return 'Importing'
    default:
      return 'Queued'
  }
}

function ImportPage() {
  const {
    queue,
    files,
    isDragging,
    setIsDragging,
    error,
    setError,
    isUploading,
    isAuthenticated,
    submit,
    addFiles,
  } = useImportFlow()

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragging(false)
    try {
      const dropped = await filesFromDataTransfer(event.dataTransfer)
      if (dropped.length > 0) {
        addFiles(dropped)
      }
    } catch {
      setError('Could not read the dropped files.')
    }
  }

  const finished = queue.filter(
    (item) => item.status === 'done' || item.status === 'failed',
  ).length

  return (
    <RequireAuth>
      <div className="min-h-screen px-6 pb-16 pt-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
          <div className="surface flex flex-wrap items-center justify-between gap-6 rounded-[28px] p-6">
            <div>
              <h1 className="text-3xl">Add books</h1>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Drop EPUBs — or an entire folder of them.
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
                  onDrop={handleDrop}
                >
                  <p className="text-base font-semibold">Drop EPUBs or folders</p>
                  <p className="mt-2 text-xs text-[var(--muted-2)]">
                    {files.length > 0
                      ? `${files.length} file(s) queued`
                      : 'or choose files below'}
                  </p>
                </div>

                <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
                  <label className="upload-control w-full md:w-auto">
                    <span className="upload-label">Choose files</span>
                    <span className="upload-meta">EPUB only</span>
                    <input
                      className="upload-input"
                      type="file"
                      multiple
                      accept=".epub,application/epub+zip"
                      onChange={(event) => {
                        if (event.target.files) {
                          addFiles(event.target.files)
                        }
                        event.target.value = ''
                      }}
                    />
                  </label>
                  <label className="upload-control w-full md:w-auto">
                    <span className="upload-label">Choose folder</span>
                    <span className="upload-meta">EPUBs inside are picked up</span>
                    <input
                      className="upload-input"
                      type="file"
                      multiple
                      {...({ webkitdirectory: '' } as Record<string, string>)}
                      onChange={(event) => {
                        if (event.target.files) {
                          addFiles(event.target.files)
                        }
                        event.target.value = ''
                      }}
                    />
                  </label>
                  <button
                    className="btn btn-primary w-full md:w-auto"
                    onClick={submit}
                    disabled={isUploading || files.length === 0 || !isAuthenticated}
                  >
                    {isUploading
                      ? `Importing… (${finished}/${queue.length})`
                      : `Import ${files.length > 0 ? files.length : ''} book${files.length === 1 ? '' : 's'}`}
                  </button>
                </div>

                {error ? (
                  <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>
                ) : null}
                {!isAuthenticated ? (
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Sign in to upload and sync your library.
                  </p>
                ) : null}
              </div>

              <div className="surface-soft rounded-2xl p-5">
                <div className="text-xs uppercase tracking-[0.35em] text-[var(--accent-3)]">
                  Queue
                </div>
                {queue.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--muted)]">
                    Nothing queued yet.
                  </p>
                ) : (
                  <div className="reader-scroll mt-3 max-h-[50vh] space-y-2 overflow-auto">
                    {queue.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-4 rounded-2xl border border-white/5 bg-[rgba(12,15,18,0.6)] px-3 py-2 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold">
                            {item.title ?? item.file.name}
                          </div>
                          {item.error ? (
                            <div className="mt-0.5 truncate text-[10px] text-rose-300">
                              {item.error}
                            </div>
                          ) : null}
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.25em] ${statusChip(item)}`}
                        >
                          {statusLabel(item)}
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
