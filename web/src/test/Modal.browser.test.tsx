import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Modal } from "../components/Modal";

// The shared Modal must move focus into the dialog on open and trap Tab within
// it. A display:none control (e.g. EditBookDialog's hidden file input, which is
// the panel's first focusable in DOM order) must be skipped: `.focus()` no-ops
// on it, so treating it as the focus target strands focus outside the dialog.

describe("Modal focus management", () => {
	it("moves initial focus past a hidden first control to the first visible one", async () => {
		const screen = await render(
			<Modal label="Edit" onClose={() => {}} panelClassName="surface">
				<input type="file" style={{ display: "none" }} data-testid="hidden" />
				<button type="button" data-testid="visible">
					Choose
				</button>
			</Modal>,
		);
		const visible = screen.container.querySelector(
			'[data-testid="visible"]',
		) as HTMLElement;
		await expect.poll(() => document.activeElement).toBe(visible);
	});

	it("skips a hidden control when wrapping Tab focus", async () => {
		const screen = await render(
			<Modal label="Edit" onClose={() => {}} panelClassName="surface">
				<button type="button" data-testid="first">
					First
				</button>
				<button type="button" data-testid="second">
					Second
				</button>
				<input type="file" style={{ display: "none" }} data-testid="hidden" />
			</Modal>,
		);
		const first = screen.container.querySelector(
			'[data-testid="first"]',
		) as HTMLElement;
		const second = screen.container.querySelector(
			'[data-testid="second"]',
		) as HTMLElement;

		// Tab from the last VISIBLE control must wrap to the first, not stop on the
		// hidden input that trails it in the DOM.
		second.focus();
		second.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
		);
		expect(document.activeElement).toBe(first);
	});
});
