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
  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
      <div className="surface w-full max-w-lg rounded-[24px] p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl">Reader Preferences</h2>
          <button
            className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="mt-6 space-y-5 text-sm text-[var(--muted)]">
          <div>
            <div className="text-xs uppercase tracking-[0.3em]">Font size</div>
            <div className="mt-2 flex items-center gap-3">
              <button
                className="btn btn-ghost text-xs"
                onClick={() => setFontScale((prev) => Math.max(prev - 1, -1))}
              >
                A-
              </button>
              <div className="text-xs uppercase tracking-[0.3em] text-[var(--muted-2)]">
                {fontSize}px
              </div>
              <button
                className="btn btn-ghost text-xs"
                onClick={() => setFontScale((prev) => Math.min(prev + 1, 3))}
              >
                A+
              </button>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.3em]">Line height</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {[1.5, 1.7, 1.9, 2.1].map((value) => (
                <button
                  key={value}
                  className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.3em] ${
                    lineHeight === value
                      ? 'border-[rgba(209,161,92,0.6)] bg-[rgba(209,161,92,0.15)] text-[var(--accent)]'
                      : 'border-white/10 text-[var(--muted-2)]'
                  }`}
                  onClick={() => setLineHeight(value)}
                >
                  {value.toFixed(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.3em]">Content width</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                { label: 'Narrow', value: 560 },
                { label: 'Comfort', value: 720 },
                { label: 'Wide', value: 880 },
              ].map((option) => (
                <button
                  key={option.label}
                  className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.3em] ${
                    contentWidth === option.value
                      ? 'border-[rgba(209,161,92,0.6)] bg-[rgba(209,161,92,0.15)] text-[var(--accent)]'
                      : 'border-white/10 text-[var(--muted-2)]'
                  }`}
                  onClick={() => setContentWidth(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.3em]">Theme</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {['night', 'sepia', 'paper'].map((option) => (
                <button
                  key={option}
                  className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.3em] ${
                    theme === option
                      ? 'border-[rgba(209,161,92,0.6)] bg-[rgba(209,161,92,0.15)] text-[var(--accent)]'
                      : 'border-white/10 text-[var(--muted-2)]'
                  }`}
                  onClick={() => setTheme(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
