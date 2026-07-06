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
            <div className="flex items-center gap-2">
              <button
                className="chip is-framed"
                onClick={() => setFontScale((prev) => Math.max(prev - 1, -1))}
              >
                A-
              </button>
              <div className="w-10 text-center text-sm text-[var(--muted-2)]">
                {fontSize}px
              </div>
              <button
                className="chip is-framed"
                onClick={() => setFontScale((prev) => Math.min(prev + 1, 3))}
              >
                A+
              </button>
            </div>
          </div>
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
