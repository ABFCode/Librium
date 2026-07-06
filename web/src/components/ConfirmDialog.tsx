import { useEffect, useState } from 'react'

type ConfirmDialogProps = {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  // When set, the confirm button stays disabled until this exact text is
  // typed (e.g. "DELETE") — replaces window.prompt-based confirmations.
  requireText?: string
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmDialog = ({
  title,
  message,
  confirmLabel,
  danger,
  requireText,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const [typed, setTyped] = useState('')
  const armed = !requireText || typed === requireText

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel()
      }
      if (event.key === 'Enter' && armed) {
        onConfirm()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [armed, onCancel, onConfirm])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-6"
      onClick={onCancel}
    >
      <div
        className="surface w-full max-w-sm p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-xl">{title}</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{message}</p>
        {requireText ? (
          <input
            className="input mt-4"
            placeholder={`Type ${requireText} to confirm`}
            value={typed}
            autoFocus
            onChange={(event) => setTyped(event.target.value)}
          />
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn btn-ghost text-xs" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={`btn text-xs ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={!armed}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
