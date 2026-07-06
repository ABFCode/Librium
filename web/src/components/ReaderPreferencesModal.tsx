import { useEffect } from 'react'

type ReaderPreferencesModalProps = {
  isOpen: boolean
  onClose: () => void
  fontSize: number
  setFontScale: (value: number | ((prev: number) => number)) => void
  lineHeight: number
  setLineHeight: (value: number) => void
  contentWidth: number
  setContentWidth: (value: number) => void
  theme: string
  setTheme: (value: string) => void
  fontFamily?: string
  setFontFamily?: (value: string) => void
}

export const ReaderPreferencesModal = ({
  isOpen,
  onClose,
  fontSize,
  setFontScale,
  lineHeight,
  setLineHeight,
  contentWidth,
  setContentWidth,
  theme,
  setTheme,
  fontFamily,
  setFontFamily,
}: ReaderPreferencesModalProps) => {
  useEffect(() => {
    if (!isOpen) {
      return
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  return (
    // Light dim + click-outside close: changes preview live on the page
    // behind the panel.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-6"
      onClick={onClose}
    >
      <div
        className="surface w-full max-w-md p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl">Reader preferences</h2>
          <button className="icon-btn -mr-1" onClick={onClose}>
            <span className="sr-only">Close</span>
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="mt-5 space-y-5 text-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="text-[var(--muted)]">Font size</div>
            <div className="flex items-center gap-3">
              <input
                className="slider"
                type="range"
                min={12}
                max={36}
                step={1}
                value={fontSize}
                aria-label="Font size"
                onChange={(event) =>
                  // fontSize = 16 + 2 * fontScale → scale in half-steps.
                  setFontScale((Number(event.target.value) - 16) / 2)
                }
              />
              <input
                className="input w-16 px-2 py-1 text-center text-sm"
                type="number"
                min={12}
                max={36}
                value={fontSize}
                aria-label="Font size in pixels"
                onChange={(event) => {
                  const value = Number(event.target.value)
                  if (!Number.isFinite(value)) {
                    return
                  }
                  setFontScale(
                    (Math.min(Math.max(value, 12), 36) - 16) / 2,
                  )
                }}
              />
            </div>
          </div>
          {setFontFamily ? (
            <div className="flex items-center justify-between gap-4">
              <div className="text-[var(--muted)]">Font</div>
              <div className="flex gap-1">
                {[
                  { key: 'sans', label: 'Sans' },
                  { key: 'serif', label: 'Serif' },
                ].map((option) => (
                  <button
                    key={option.key}
                    className={`chip ${(fontFamily ?? 'sans') === option.key ? 'is-active' : ''}`}
                    onClick={() => setFontFamily(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-4">
            <div className="text-[var(--muted)]">Line height</div>
            <div className="flex gap-1">
              {[1.5, 1.7, 1.9, 2.1].map((value) => (
                <button
                  key={value}
                  className={`chip ${lineHeight === value ? 'is-active' : ''}`}
                  onClick={() => setLineHeight(value)}
                >
                  {value.toFixed(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="text-[var(--muted)]">Width</div>
            <div className="flex gap-1">
              {[
                { label: 'Narrow', value: 560 },
                { label: 'Comfort', value: 720 },
                { label: 'Wide', value: 880 },
              ].map((option) => (
                <button
                  key={option.label}
                  className={`chip ${contentWidth === option.value ? 'is-active' : ''}`}
                  onClick={() => setContentWidth(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="text-[var(--muted)]">Theme</div>
            <div className="flex gap-1">
              {[
                { key: 'night', label: 'Night' },
                { key: 'sepia', label: 'Sepia' },
                { key: 'paper', label: 'Paper' },
              ].map((option) => (
                <button
                  key={option.key}
                  className={`chip ${theme === option.key ? 'is-active' : ''}`}
                  onClick={() => setTheme(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
