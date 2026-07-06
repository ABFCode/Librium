import { useEffect, useState } from "react";

type ConfirmDialogProps = {
	title: string;
	message: string;
	confirmLabel: string;
	danger?: boolean;
	// When set, the confirm button stays disabled until this exact text is
	// typed (e.g. "DELETE") — replaces window.prompt-based confirmations.
	requireText?: string;
	onConfirm: () => void;
	onCancel: () => void;
};

export const ConfirmDialog = ({
	title,
	message,
	confirmLabel,
	danger,
	requireText,
	onConfirm,
	onCancel,
}: ConfirmDialogProps) => {
	const [typed, setTyped] = useState("");
	const armed = !requireText || typed === requireText;

	// Escape cancels globally. Enter is deliberately NOT handled at the window
	// level: a global Enter-to-confirm fires even with focus on the Cancel
	// button, turning "Enter on Cancel" into the destructive action. Buttons
	// handle Enter natively when focused; the type-to-confirm input opts in
	// below.
	useEffect(() => {
		const handleKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onCancel();
			}
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [onCancel]);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-cancel is a pointer nicety; Escape and the Cancel button cover keyboard users
		// biome-ignore lint/a11y/useKeyWithClickEvents: see above
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-6"
			onClick={onCancel}
		>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: the click handler only stops backdrop-cancel propagation */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: see above */}
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
						// biome-ignore lint/a11y/noAutofocus: focus must move into the just-opened dialog; the type-to-confirm input is its primary control
						autoFocus
						onChange={(event) => setTyped(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && armed) {
								onConfirm();
							}
						}}
					/>
				) : null}
				<div className="mt-5 flex justify-end gap-2">
					<button
						type="button"
						className="btn btn-ghost text-xs"
						onClick={onCancel}
					>
						Cancel
					</button>
					<button
						type="button"
						className={`btn text-xs ${danger ? "btn-danger" : "btn-primary"}`}
						disabled={!armed}
						onClick={onConfirm}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
};
