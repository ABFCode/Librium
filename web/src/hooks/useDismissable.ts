import { type RefObject, useEffect } from "react";

/**
 * Dismiss-on-outside-click + Escape for popover menus. Replaces the old
 * onMouseLeave dismissal, which closed the menu the moment the pointer
 * dipped outside its bounds — the "finicky menu" failure mode.
 *
 * pointerdown (not click) so the menu closes before whatever was under the
 * pointer receives the click, matching native menu feel; the menu's own
 * clicks are inside `ref` and unaffected.
 */
export function useDismissable(
	ref: RefObject<HTMLElement | null>,
	open: boolean,
	onClose: () => void,
) {
	useEffect(() => {
		if (!open) {
			return;
		}
		const onPointerDown = (event: PointerEvent) => {
			if (ref.current && !ref.current.contains(event.target as Node)) {
				onClose();
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open, onClose, ref]);
}
