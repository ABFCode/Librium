import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { ConfirmDialog } from "../components/ConfirmDialog";

const renderDialog = async (
	overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {},
) => {
	const onConfirm = vi.fn();
	const onCancel = vi.fn();
	const screen = await render(
		<ConfirmDialog
			title="Delete book"
			message="This permanently deletes the book."
			confirmLabel="Delete"
			danger
			onConfirm={onConfirm}
			onCancel={onCancel}
			{...overrides}
		/>,
	);
	return { screen, onConfirm, onCancel };
};

describe("ConfirmDialog", () => {
	it("exposes modal semantics and traps keyboard focus", async () => {
		const { screen } = await renderDialog();
		const dialog = screen.container.querySelector(
			'[role="dialog"]',
		) as HTMLElement;
		expect(dialog).toBeTruthy();
		expect(dialog.getAttribute("aria-modal")).toBe("true");
		expect(dialog.getAttribute("aria-label")).toBe("Delete book");

		const buttons = [...dialog.querySelectorAll("button")];
		buttons.at(-1)?.focus();
		buttons
			.at(-1)
			?.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
			);
		expect(document.activeElement).toBe(buttons[0]);

		buttons[0]?.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "Tab",
				shiftKey: true,
				bubbles: true,
			}),
		);
		expect(document.activeElement).toBe(buttons.at(-1));
	});

	it("does NOT confirm on a window-level Enter (Enter on Cancel regression)", async () => {
		// Regression: a global Enter-to-confirm handler executed the destructive
		// action even with focus on the Cancel button.
		const { onConfirm } = await renderDialog();
		window.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
		);
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("cancels on Escape", async () => {
		const { onConfirm, onCancel } = await renderDialog();
		window.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		);
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("cancels on backdrop click but not on panel click", async () => {
		const { screen, onCancel } = await renderDialog();
		await screen.getByText("Delete book").click();
		expect(onCancel).not.toHaveBeenCalled();
		(screen.container.firstElementChild as HTMLElement).click();
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("keeps the confirm button disarmed until the required text is typed", async () => {
		const { screen, onConfirm } = await renderDialog({ requireText: "DELETE" });
		const confirmBtn = [...screen.container.querySelectorAll("button")].find(
			(b) => b.textContent === "Delete",
		) as HTMLButtonElement;
		expect(confirmBtn.disabled).toBe(true);
		confirmBtn.click();
		expect(onConfirm).not.toHaveBeenCalled();

		const input = screen.container.querySelector("input") as HTMLInputElement;
		const setValue = Object.getOwnPropertyDescriptor(
			window.HTMLInputElement.prototype,
			"value",
		)?.set;
		if (!setValue) {
			throw new Error("HTMLInputElement value setter missing");
		}
		setValue.call(input, "DELET");
		input.dispatchEvent(new Event("input", { bubbles: true }));
		expect(confirmBtn.disabled).toBe(true);

		setValue.call(input, "DELETE");
		input.dispatchEvent(new Event("input", { bubbles: true }));
		expect(confirmBtn.disabled).toBe(false);
	});

	it("confirms on Enter only from the armed type-to-confirm input", async () => {
		const { screen, onConfirm } = await renderDialog({ requireText: "DELETE" });
		const input = screen.container.querySelector("input") as HTMLInputElement;
		const setValue = Object.getOwnPropertyDescriptor(
			window.HTMLInputElement.prototype,
			"value",
		)?.set;
		if (!setValue) {
			throw new Error("HTMLInputElement value setter missing");
		}

		// Not armed: Enter in the input does nothing.
		input.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
		);
		expect(onConfirm).not.toHaveBeenCalled();

		setValue.call(input, "DELETE");
		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
		);
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});
});
