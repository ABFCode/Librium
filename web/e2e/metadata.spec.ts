import { expect, type Page, test } from "@playwright/test";
import { buildFixtureEpub } from "./fixtureEpub";

// Metadata journey: edit details from the card menu, see the shelf update,
// and verify the edit survives content re-seeding (Remove download →
// Download to this device re-parses the EPUB, which must not resurrect the
// embedded metadata). The re-seed leg needs the EPUB in R2, so it only runs
// when the import reached "Ready" (CI's anonymous backend has no R2 creds —
// same tolerance as reading.spec.ts).

const email = `e2e-meta-${Date.now()}@test.local`;
const password = "e2e-password-123";

const cardFor = (page: Page, title: string) =>
	page.locator(".book-card", { hasText: title });

test.describe.configure({ mode: "serial" });

test("edit details updates the shelf and survives a re-download", async ({
	page,
}) => {
	test.setTimeout(120_000);

	await page.goto("/sign-up");
	await page.getByPlaceholder("Name").fill("E2E Editor");
	await page.getByPlaceholder("Email").fill(email);
	await page.getByPlaceholder("Password").fill(password);
	await page.getByRole("button", { name: "Create account" }).click();
	await page.waitForURL("**/library", { timeout: 20_000 });

	await page.goto("/import");
	await page.locator('input[type="file"][accept*="epub"]').setInputFiles({
		name: "e2e-fixture.epub",
		mimeType: "application/epub+zip",
		buffer: buildFixtureEpub(),
	});
	await page.getByRole("button", { name: /Import 1 book/ }).click();
	await expect(page.locator(".queue-status")).toHaveText(/Ready|Failed/, {
		timeout: 30_000,
	});
	const uploaded = (
		await page.locator(".queue-status").textContent()
	)?.includes("Ready");

	await page.goto("/library");
	await expect(cardFor(page, "E2E Fixture")).toBeVisible({ timeout: 15_000 });

	// ── Edit title + author via the dialog ──────────────────────────────────
	await cardFor(page, "E2E Fixture")
		.getByRole("button", { name: "Open menu" })
		.click();
	await page.getByRole("button", { name: "Edit details…" }).click();
	await page.getByLabel("Title").fill("Renamed Fixture");
	await page.getByLabel("Author").fill("Real Author");
	await page.getByRole("button", { name: "Save", exact: true }).click();

	const renamed = cardFor(page, "Renamed Fixture");
	await expect(renamed).toBeVisible({ timeout: 15_000 });
	await expect(renamed).toContainText("Real Author");

	// ── The edit survives content re-seeding ────────────────────────────────
	if (uploaded) {
		await renamed.getByRole("button", { name: "Open menu" }).click();
		// Single-book removal is immediate (no confirmation dialog).
		await page.getByRole("button", { name: "Remove download" }).click();
		await expect(renamed.locator(".device-dot")).toHaveCount(0, {
			timeout: 10_000,
		});

		await renamed.getByRole("button", { name: "Open menu" }).click();
		await page.getByRole("button", { name: "Download to this device" }).click();
		await expect(renamed.locator(".device-dot")).toHaveCount(1, {
			timeout: 30_000,
		});
		// Re-parse finished; the EPUB's embedded title must not have come back.
		await expect(cardFor(page, "Renamed Fixture")).toBeVisible();
	}

	// ── Persists across a reload ─────────────────────────────────────────────
	await page.reload();
	await expect(cardFor(page, "Renamed Fixture")).toBeVisible({
		timeout: 15_000,
	});
});
