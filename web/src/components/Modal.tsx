import { useEffect, useRef } from "react";

type ModalProps = {
	label: string;
	onClose: () => void;
	onEscape?: () => void;
	panelClassName: string;
	backdropClassName?: string;
	children: React.ReactNode;
};

const focusable =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// display:none / detached controls match `focusable` but can't hold focus
// (.focus() no-ops), so enumerate only ones that are actually rendered — e.g.
// EditBookDialog's hidden file input is the panel's first focusable in the DOM.
const isVisible = (el: HTMLElement) =>
	el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;

const visibleFocusables = (root: HTMLElement | null): HTMLElement[] =>
	Array.from(root?.querySelectorAll<HTMLElement>(focusable) ?? []).filter(
		isVisible,
	);
let bodyLockCount = 0;
let previousBodyOverflow = "";
const modalStack: symbol[] = [];

/** Accessible modal shell shared by every blocking dialog in the app. */
export function Modal({
	label,
	onClose,
	onEscape = onClose,
	panelClassName,
	backdropClassName = "px-6",
	children,
}: ModalProps) {
	const panelRef = useRef<HTMLDivElement>(null);
	const modalId = useRef(Symbol("modal"));
	const escapeRef = useRef(onEscape);
	escapeRef.current = onEscape;

	useEffect(() => {
		const previouslyFocused = document.activeElement as HTMLElement | null;
		if (bodyLockCount === 0) {
			previousBodyOverflow = document.body.style.overflow;
			document.body.style.overflow = "hidden";
		}
		bodyLockCount += 1;
		modalStack.push(modalId.current);
		const handleEscape = (event: KeyboardEvent) => {
			if (
				event.key === "Escape" &&
				modalStack[modalStack.length - 1] === modalId.current
			) {
				event.preventDefault();
				escapeRef.current();
			}
		};
		window.addEventListener("keydown", handleEscape);
		const frame = requestAnimationFrame(() => {
			const items = visibleFocusables(panelRef.current);
			const preferred = items.find((el) => el.hasAttribute("autofocus"));
			(preferred ?? items[0] ?? panelRef.current)?.focus();
		});
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("keydown", handleEscape);
			const stackIndex = modalStack.lastIndexOf(modalId.current);
			if (stackIndex >= 0) modalStack.splice(stackIndex, 1);
			bodyLockCount = Math.max(0, bodyLockCount - 1);
			if (bodyLockCount === 0) {
				document.body.style.overflow = previousBodyOverflow;
			}
			previouslyFocused?.focus();
		};
	}, []);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: backdrop pointer dismissal complements Escape and explicit close controls
		// biome-ignore lint/a11y/useKeyWithClickEvents: Escape is the keyboard equivalent for backdrop dismissal
		<div
			className={`fixed inset-0 z-50 flex items-center justify-center bg-black/25 ${backdropClassName}`}
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-label={label}
				tabIndex={-1}
				className={panelClassName}
				onKeyDown={(event) => {
					if (event.key !== "Tab") return;
					const items = visibleFocusables(panelRef.current);
					if (items.length === 0) {
						event.preventDefault();
						panelRef.current?.focus();
						return;
					}
					const first = items[0];
					const last = items[items.length - 1];
					if (event.shiftKey && document.activeElement === first) {
						event.preventDefault();
						last.focus();
					} else if (!event.shiftKey && document.activeElement === last) {
						event.preventDefault();
						first.focus();
					}
				}}
			>
				{children}
			</div>
		</div>
	);
}
