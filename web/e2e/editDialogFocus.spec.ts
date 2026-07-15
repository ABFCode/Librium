import { expect, test } from "@playwright/test";
import { buildFixtureEpub } from "./fixtureEpub";

// Regression for the shared Modal's initial focus: opening EditBookDialog must
// move keyboard focus INTO the dialog. Its first focusable element in DOM order
// is a display:none file input, and `.focus()` no-ops on it — so the buggy
// Modal left focus outside the dialog entirely (a focus-trap / a11y failure).

const stamp = Date.now();
const email = `e2e-focus-${stamp}@test.local`;
const password = "e2e-password-123";
const title = "Focus Fixture Book";

test("opening Edit details moves focus into the dialog, not onto the hidden file input", async ({
	page,
}) => {
	test.setTimeout(120_000);

	await page.goto("/sign-up");
	await page.getByPlaceholder("Name").fill("Focus Reader");
	await page.getByPlaceholder("Email").fill(email);
	await page.getByPlaceholder("Password").fill(password);
	await page.getByRole("button", { name: "Create account" }).click();
	await page.waitForURL("**/library", { timeout: 20_000 });

	await page.goto("/import");
	await page.locator('input[type="file"][accept*="epub"]').setInputFiles({
		name: "focus.epub",
		mimeType: "application/epub+zip",
		buffer: Buffer.from(buildFixtureEpub(title)),
	});
	await page.getByRole("button", { name: /Import 1 book/ }).click();
	await expect(page.locator(".queue-status")).toHaveText(/Ready|Failed/, {
		timeout: 30_000,
	});
	await page.goto("/library");
	const card = page.locator(".book-card", { hasText: title });
	await expect(card).toBeVisible({ timeout: 15_000 });

	// Open the card menu → Edit details, which mounts the shared Modal.
	await card.getByRole("button", { name: "Open menu" }).click();
	await page.getByRole("button", { name: "Edit details…" }).click();
	await expect(page.locator('[role="dialog"]')).toBeVisible();

	// Focus must be inside the dialog, on a visible control — never stranded on
	// the hidden file input or outside the dialog.
	await expect
		.poll(() =>
			page.evaluate(() => {
				const el = document.activeElement as HTMLElement | null;
				const dialog = document.querySelector('[role="dialog"]');
				return {
					inDialog: Boolean(el && dialog?.contains(el)),
					isHiddenFileInput:
						el?.tagName === "INPUT" && (el as HTMLInputElement).type === "file",
					visible: Boolean(
						el &&
							(el.offsetWidth > 0 ||
								el.offsetHeight > 0 ||
								el.getClientRects().length > 0),
					),
				};
			}),
		)
		.toMatchObject({
			inDialog: true,
			isHiddenFileInput: false,
			visible: true,
		});
});
