import { Icon } from "./Icon";
import { Modal } from "./Modal";

type ReaderPreferencesModalProps = {
	isOpen: boolean;
	onClose: () => void;
	fontSize: number;
	setFontScale: (value: number | ((prev: number) => number)) => void;
	lineHeight: number;
	setLineHeight: (value: number) => void;
	contentWidth: number;
	setContentWidth: (value: number) => void;
	theme: string;
	setTheme: (value: string) => void;
	fontFamily: string;
	setFontFamily: (value: string) => void;
};

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
	if (!isOpen) {
		return null;
	}

	return (
		<Modal
			label="Reader preferences"
			onClose={onClose}
			panelClassName="reader-preferences-panel surface w-full max-w-md p-6"
		>
			<div className="flex items-center justify-between">
				<h2 className="text-xl">Reader preferences</h2>
				<button type="button" className="icon-btn -mr-1" onClick={onClose}>
					<span className="sr-only">Close</span>
					<Icon name="close" />
				</button>
			</div>
			<div className="mt-5 space-y-5 text-sm">
				<div className="reader-pref-row flex items-center justify-between gap-4">
					<div className="text-[var(--muted)]">Font size</div>
					<div className="reader-pref-size-controls flex items-center gap-3">
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
								const value = Number(event.target.value);
								if (!Number.isFinite(value)) {
									return;
								}
								setFontScale((Math.min(Math.max(value, 12), 36) - 16) / 2);
							}}
						/>
					</div>
				</div>
				<div className="reader-pref-row flex items-center justify-between gap-4">
					<div className="text-[var(--muted)]">Font</div>
					<div className="reader-pref-options flex gap-1">
						{[
							{ key: "sans", label: "Sans" },
							{ key: "serif", label: "Serif" },
						].map((option) => (
							<button
								type="button"
								key={option.key}
								className={`chip ${fontFamily === option.key ? "is-active" : ""}`}
								onClick={() => setFontFamily(option.key)}
							>
								{option.label}
							</button>
						))}
					</div>
				</div>
				<div className="reader-pref-row flex items-center justify-between gap-4">
					<div className="text-[var(--muted)]">Line height</div>
					<div className="reader-pref-options flex gap-1">
						{[1.5, 1.7, 1.9, 2.1].map((value) => (
							<button
								type="button"
								key={value}
								className={`chip ${lineHeight === value ? "is-active" : ""}`}
								onClick={() => setLineHeight(value)}
							>
								{value.toFixed(1)}
							</button>
						))}
					</div>
				</div>
				<div className="reader-pref-row flex items-center justify-between gap-4">
					<div className="text-[var(--muted)]">Width</div>
					<div className="reader-pref-options flex gap-1">
						{[
							{ label: "Narrow", value: 560 },
							{ label: "Comfort", value: 720 },
							{ label: "Wide", value: 880 },
						].map((option) => (
							<button
								type="button"
								key={option.label}
								className={`chip ${contentWidth === option.value ? "is-active" : ""}`}
								onClick={() => setContentWidth(option.value)}
							>
								{option.label}
							</button>
						))}
					</div>
				</div>
				<div className="reader-pref-row flex items-center justify-between gap-4">
					<div className="text-[var(--muted)]">Theme</div>
					<div className="reader-pref-options flex gap-1">
						{[
							{ key: "night", label: "Night" },
							{ key: "sepia", label: "Sepia" },
							{ key: "paper", label: "Paper" },
						].map((option) => (
							<button
								type="button"
								key={option.key}
								className={`chip ${theme === option.key ? "is-active" : ""}`}
								onClick={() => setTheme(option.key)}
							>
								{option.label}
							</button>
						))}
					</div>
				</div>
			</div>
		</Modal>
	);
};
