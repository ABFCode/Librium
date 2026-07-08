import { expect, type Page, test } from "@playwright/test";
import { buildFixtureEpub } from "./fixtureEpub";

// Regression guard for the 0.10.1 fix: marking a reading status must NOT
// reorder the default "Recent" shelf (status writes bump the sync clock, but
// recency now reads from a separate lastActivityAt that status never touches).

const email = `e2e-recent-${Date.now()}@test.local`;
const password = "e2e-password-123";

const importBook = async (page: Page, title: string) => {
	await page.goto("/import");
	await page.locator('input[type="file"][accept*="epub"]').setInputFiles({
		name: `${title}.epub`,
		mimeType: "application/epub+zip",
		buffer: Buffer.from(buildFixtureEpub(title)),
	});
	await page.getByRole("button", { name: /Import 1 book/ }).click();
	await expect(page.locator(".queue-status")).toHaveText(/Ready|Failed/, {
		timeout: 30_000,
	});
};

// Titles in shelf order, top-left first (grid renders sorted books in order).
const shelfOrder = async (page: Page) =>
	page.locator(".book-card .book-title").allTextContents();

test("marking a status does not reshuffle the Recent sort", async ({
	page,
}) => {
	test.setTimeout(120_000);

	await page.goto("/sign-up");
	await page.getByPlaceholder("Name").fill("E2E Recent");
	await page.getByPlaceholder("Email").fill(email);
	await page.getByPlaceholder("Password").fill(password);
	await page.getByRole("button", { name: "Create account" }).click();
	await page.waitForURL("**/library", { timeout: 20_000 });

	// Import Older first, then Newer — Newer is more recent.
	await importBook(page, "Older Book");
	await importBook(page, "Newer Book");

	await page.goto("/library");
	await expect(page.locator(".book-card")).toHaveCount(2, { timeout: 15_000 });
	// Default sort is Recent: the last-imported book leads.
	await expect
		.poll(() => shelfOrder(page))
		.toEqual(["Newer Book", "Older Book"]);

	// Mark the OLDER book as Abandoned — organizing, not reading.
	await page
		.locator(".book-card", { hasText: "Older Book" })
		.getByRole("button", { name: "Open menu" })
		.click();
	await page
		.locator(".book-menu")
		.getByRole("button", { name: "Abandoned" })
		.click();

	// DIAGNOSTIC: prove the status write reached the server (filter isolates it).
	await page.getByRole("button", { name: "Abandoned", exact: true }).click();
	await expect.poll(() => shelfOrder(page)).toEqual(["Older Book"]);
	await page.getByRole("button", { name: "All", exact: true }).click();
	await expect(page.locator(".book-card")).toHaveCount(2);

	// The order must be unchanged — the status edit must not vault Older to top.
	// Poll a few times so a (buggy) reorder would have time to land and fail.
	await expect
		.poll(() => shelfOrder(page), { timeout: 5_000 })
		.toEqual(["Newer Book", "Older Book"]);
});
