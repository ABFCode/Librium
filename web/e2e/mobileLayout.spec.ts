import { expect, test } from "@playwright/test";
import { buildFixtureEpub } from "./fixtureEpub";

const expectInsideViewport = async (
	locator: import("@playwright/test").Locator,
) => {
	const bounds = await locator.boundingBox();
	expect(bounds).not.toBeNull();
	if (!bounds) return;
	const viewport = locator.page().viewportSize();
	expect(viewport).not.toBeNull();
	if (!viewport) return;
	expect(bounds.x).toBeGreaterThanOrEqual(0);
	expect(bounds.y).toBeGreaterThanOrEqual(0);
	expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
	expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
};

test("library controls stay reachable at supported touch widths", async ({
	browser,
}) => {
	const context = await browser.newContext({
		viewport: { width: 320, height: 800 },
		hasTouch: true,
	});
	const page = await context.newPage();
	const email = `e2e-mobile-${Date.now()}@test.local`;

	await page.goto("/sign-up");
	await page.getByPlaceholder("Name").fill("Mobile Reader");
	await page.getByPlaceholder("Email").fill(email);
	await page.getByPlaceholder("Password").fill("e2e-password-123");
	await page.getByRole("button", { name: "Create account" }).click();
	await page.waitForURL("**/library", { timeout: 20_000 });

	for (const width of [320, 375, 390, 768]) {
		await page.setViewportSize({ width, height: 800 });
		await expect
			.poll(() =>
				page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
			)
			.toBe(true);
	}

	// Coarse-pointer controls meet the 44px touch-target floor even though the
	// visual chip itself stays compact for mouse users.
	const chip = page.locator(".chip").first();
	await expect(chip).toBeVisible();
	expect(
		await chip.evaluate((node) => node.getBoundingClientRect().height),
	).toBeGreaterThanOrEqual(44);

	await page.setViewportSize({ width: 320, height: 800 });
	await page.getByRole("button", { name: "Library actions" }).click();
	await expectInsideViewport(page.locator(".library-actions-menu"));
	await expect(
		page.getByRole("button", { name: "Account & storage…" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Library actions" }).click();

	await page.getByRole("button", { name: "Collection", exact: true }).click();
	await expectInsideViewport(page.locator(".library-collection-menu"));
	await expect(
		page.getByRole("button", { name: "Manage collections…" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Collection", exact: true }).click();

	await page.goto("/import");
	await page.locator('input[type="file"][accept*="epub"]').setInputFiles({
		name: "mobile-menu.epub",
		mimeType: "application/epub+zip",
		buffer: Buffer.from(buildFixtureEpub("Mobile Menu Fixture")),
	});
	await page.getByRole("button", { name: /Import 1 book/ }).click();
	await expect(page.locator(".queue-status")).toHaveText(/Ready|Failed/, {
		timeout: 30_000,
	});
	await page.goto("/library");
	const card = page.locator(".book-card", { hasText: "Mobile Menu Fixture" });
	await expect(card).toBeVisible({ timeout: 15_000 });
	await card.getByRole("button", { name: "Open menu" }).click();
	await expectInsideViewport(page.locator(".book-menu"));
	await expect(page.getByRole("button", { name: "Delete book" })).toBeVisible();

	await context.close();
});
