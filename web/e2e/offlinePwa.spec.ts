import { expect, test } from "@playwright/test";
import { buildFixtureEpub } from "./fixtureEpub";

const email = `e2e-offline-${Date.now()}@test.local`;
const password = "e2e-password-123";
const title = "Offline PWA Fixture";

test("production PWA cold-starts the library and reader offline", async ({
	page,
	context,
}) => {
	await page.goto("/sign-up");
	await page.getByPlaceholder("Name").fill("Offline Reader");
	await page.getByPlaceholder("Email").fill(email);
	await page.getByPlaceholder("Password").fill(password);
	await page.getByRole("button", { name: "Create account" }).click();
	await page.waitForURL("**/library", { timeout: 20_000 });

	await page.goto("/import");
	await page.locator('input[type="file"][accept*="epub"]').setInputFiles({
		name: "offline-fixture.epub",
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
	const readerHref = await card.getByRole("link").first().getAttribute("href");
	expect(readerHref).toBeTruthy();

	// Wait until the generated worker controls navigations, not merely until it
	// has installed. A reload is required on the first production visit.
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
		if (!navigator.serviceWorker.controller) {
			await new Promise<void>((resolve) => {
				navigator.serviceWorker.addEventListener("controllerchange", () =>
					resolve(),
				);
			});
		}
	});
	await page.reload();
	await expect(card).toBeVisible({ timeout: 15_000 });

	// Eliminate the online document and its memory cache. A fresh page must be
	// bootstrapped entirely by the production service worker and IndexedDB.
	await page.close();
	await context.setOffline(true);
	const offlinePage = await context.newPage();
	await offlinePage.goto("/library");
	await expect(
		offlinePage.locator(".book-card", { hasText: title }),
	).toBeVisible({ timeout: 20_000 });

	await offlinePage.goto(readerHref as string);
	const reader = offlinePage.locator(".reader-content .reader-scroll");
	await expect(reader).toContainText("Chapter one, paragraph 2", {
		timeout: 20_000,
	});
	// Cached whole-book search and chapter navigation must not consult Convex.
	await offlinePage.locator('button[data-tooltip="Chapters"]').click();
	await offlinePage
		.locator(".reader-drawer .chip", { hasText: "Search" })
		.click();
	await offlinePage
		.getByPlaceholder("Search the whole book…")
		.fill("xylophone-harvest");
	const result = offlinePage.locator(".reader-drawer .reader-row", {
		hasText: "xylophone-harvest",
	});
	await expect(result).toBeVisible({ timeout: 10_000 });
	await result.click();
	await expect(offlinePage.locator(".reader-topbar-title")).toHaveText(
		/Chapter II/,
	);

	const target = reader.locator('[data-chunk-index="2"]');
	await target.scrollIntoViewIfNeeded();
	await offlinePage.locator(".reader-bookmark-button").click();
	await expect(offlinePage.locator(".reader-bookmark-notice")).toHaveText(
		/Bookmark added/,
	);
	await offlinePage.waitForTimeout(1_200);

	await context.setOffline(false);
	await offlinePage.reload();
	await expect(offlinePage.locator(".reader-topbar-title")).toHaveText(
		/Chapter II/,
		{
			timeout: 20_000,
		},
	);
});
