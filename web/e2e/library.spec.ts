import { expect, type Page, test } from "@playwright/test";
import { buildFixtureEpub } from "./fixtureEpub";

// Library organization journey: status shelves + collections, end to end —
// set a status from the card menu, filter by shelf tab, create a collection
// from the picker, filter by it, and verify everything survives a reload
// (filters from localStorage; status/collections from the sync plane).
// Requires a running Convex dev deployment; R2 credentials are NOT required.

const email = `e2e-lib-${Date.now()}@test.local`;
const password = "e2e-password-123";

const cardFor = (page: Page, title: string) =>
	page.locator(".book-card", { hasText: title });

const openCardMenu = async (page: Page, title: string) => {
	await cardFor(page, title).getByRole("button", { name: "Open menu" }).click();
};

test.describe.configure({ mode: "serial" });

test("status shelves and collections organize the library", async ({
	page,
}) => {
	test.setTimeout(120_000);

	// ── Sign up and import the fixture ─────────────────────────────────────
	await page.goto("/sign-up");
	await page.getByPlaceholder("Name").fill("E2E Librarian");
	await page.getByPlaceholder("Email").fill(email);
	await page.getByPlaceholder("Password").fill(password);
	await page.getByRole("button", { name: "Create account" }).click();
	await page.waitForURL("**/library", { timeout: 20_000 });

	await page.goto("/import");
	await page.locator('input[type="file"][accept*="epub"]').setInputFiles({
		name: "e2e-fixture.epub",
		mimeType: "application/epub+zip",
		buffer: Buffer.from(buildFixtureEpub()),
	});
	await page.getByRole("button", { name: /Import 1 book/ }).click();
	await expect(page.locator(".queue-status")).toHaveText(/Ready|Failed/, {
		timeout: 30_000,
	});

	await page.goto("/library");
	await expect(cardFor(page, "E2E Fixture")).toBeVisible({ timeout: 15_000 });

	// ── Explicit status via the card menu ──────────────────────────────────
	await openCardMenu(page, "E2E Fixture");
	await page
		.locator(".book-menu")
		.getByRole("button", { name: "Abandoned" })
		.click();

	// The Abandoned shelf shows it; Finished doesn't.
	await page.getByRole("button", { name: "Abandoned" }).click();
	await expect(cardFor(page, "E2E Fixture")).toBeVisible();
	await page.getByRole("button", { name: "Finished" }).click();
	await expect(page.locator(".book-card")).toHaveCount(0);
	await page.getByRole("button", { name: "All", exact: true }).click();
	await expect(cardFor(page, "E2E Fixture")).toBeVisible();

	// ── Create a collection from the picker and file the book ──────────────
	await openCardMenu(page, "E2E Fixture");
	await page
		.locator(".book-menu")
		.getByRole("button", { name: "Add to collection…" })
		.click();
	await page.getByPlaceholder("New collection…").fill("Webnovels");
	await page.getByRole("button", { name: "Create" }).click();
	// The new collection appears checked (the book was added on create).
	await expect(page.getByRole("button", { name: /Webnovels/ })).toBeVisible();
	// exact: "Done" is a substring of the "Abandoned" shelf chip.
	await page.getByRole("button", { name: "Done", exact: true }).click();

	// ── Filter by the collection ────────────────────────────────────────────
	await page.getByRole("button", { name: /^Collection$/ }).click();
	await page.getByRole("button", { name: /Webnovels/ }).click();
	await expect(cardFor(page, "E2E Fixture")).toBeVisible();
	await expect(page.locator(".book-card")).toHaveCount(1);

	// ── Everything survives a reload ────────────────────────────────────────
	await page.reload();
	// Collection filter persisted (chip shows the active collection) and the
	// book still resolves into it once the sync plane rehydrates.
	await expect(page.getByRole("button", { name: /Webnovels/ })).toBeVisible({
		timeout: 15_000,
	});
	await expect(cardFor(page, "E2E Fixture")).toBeVisible({ timeout: 15_000 });

	// The explicit status survived too.
	await page.getByRole("button", { name: /Webnovels/ }).click();
	await page.getByRole("button", { name: "All books" }).click();
	await page.getByRole("button", { name: "Abandoned" }).click();
	await expect(cardFor(page, "E2E Fixture")).toBeVisible();
});
