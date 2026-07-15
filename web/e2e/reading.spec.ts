import { expect, type Page, test } from "@playwright/test";
import { buildFixtureEpub } from "./fixtureEpub";

// The whole local-first spine in one journey: account → import (parse to
// IndexedDB) → read → position persists across reload → whole-book search
// jumps across chapters. Requires a running Convex dev deployment (local
// backend); R2 credentials are NOT required — if the cloud backup upload
// fails the book must still be readable locally, and this test accepts
// either import outcome deliberately.

const email = `e2e-${Date.now()}@test.local`;
const password = "e2e-password-123";

const scroller = (page: Page) => page.locator(".reader-content .reader-scroll");

test.describe.configure({ mode: "serial" });

test("sign up, import, read, restore, search", async ({ page }) => {
	test.setTimeout(120_000);

	// ── Sign up ────────────────────────────────────────────────────────────
	await page.goto("/sign-up");
	await page.getByPlaceholder("Name").fill("E2E Reader");
	await page.getByPlaceholder("Email").fill(email);
	await page.getByPlaceholder("Password").fill(password);
	await page.getByRole("button", { name: "Create account" }).click();
	await page.waitForURL("**/library", { timeout: 20_000 });

	// ── Import the fixture EPUB ────────────────────────────────────────────
	// Worker proof: the parse must run in the module worker. The main-thread
	// fallback logs a distinctive marker — its appearance in a real
	// Vite-served browser means the worker chunk is broken.
	const workerFallbacks: string[] = [];
	page.on("console", (message) => {
		if (message.text().includes("[librium] parse worker unavailable")) {
			workerFallbacks.push(message.text());
		}
	});
	await page.goto("/import");
	await page.locator('input[type="file"][accept*="epub"]').setInputFiles({
		name: "e2e-fixture.epub",
		mimeType: "application/epub+zip",
		buffer: Buffer.from(buildFixtureEpub()),
	});
	await page.getByRole("button", { name: /Import 1 book/ }).click();
	// Local-first: "Failed" here means only the R2 backup failed (no
	// credentials in this environment) — the book is still fully readable.
	await expect(page.locator(".queue-status")).toHaveText(/Ready|Failed/, {
		timeout: 30_000,
	});
	expect(workerFallbacks).toEqual([]);

	// ── Open and read ──────────────────────────────────────────────────────
	await page.goto("/library");
	const card = page.locator(".book-card", { hasText: "E2E Fixture" });
	await expect(card).toBeVisible({ timeout: 15_000 });
	await card.getByRole("link").first().click();
	await expect(scroller(page)).toContainText("Chapter one, paragraph 2", {
		timeout: 20_000,
	});
	// Parser regression guard: italic runs keep their boundary spaces.
	await expect(scroller(page)).toContainText("what are you doing");

	// ── Scroll deep, wait for the trailing progress save, reload ───────────
	const target = scroller(page).locator('[data-chunk-index="20"]');
	await target.scrollIntoViewIfNeeded();
	await page.waitForTimeout(1200);
	const savedTop = await scroller(page).evaluate((el) => el.scrollTop);
	expect(savedTop).toBeGreaterThan(0);

	await page.reload();
	await expect(scroller(page)).toContainText("Chapter one", {
		timeout: 20_000,
	});
	await expect
		.poll(async () => scroller(page).evaluate((el) => el.scrollTop), {
			timeout: 10_000,
		})
		.toBeGreaterThan(savedTop * 0.8);

	// ── Whole-book search jumps across chapters ────────────────────────────
	await page.locator('button[data-tooltip="Chapters"]').click();
	await page.locator(".reader-drawer .chip", { hasText: "Search" }).click();
	await page
		.getByPlaceholder("Search the whole book…")
		.fill("xylophone-harvest");
	const result = page.locator(".reader-drawer .reader-row", {
		hasText: "xylophone-harvest",
	});
	await expect(result).toBeVisible({ timeout: 10_000 });
	await result.click();
	await expect(page.locator(".reader-topbar-title")).toHaveText(/Chapter II/, {
		timeout: 15_000,
	});
	await expect
		.poll(async () =>
			scroller(page).evaluate((el) => {
				const match = [...el.querySelectorAll("[data-chunk-index]")].find((b) =>
					b.textContent?.includes("xylophone-harvest"),
				) as HTMLElement | undefined;
				const visibleInset = Number.parseFloat(
					getComputedStyle(el).scrollPaddingTop,
				);
				return match
					? Math.abs(
							match.offsetTop -
								el.scrollTop -
								(Number.isFinite(visibleInset) ? visibleInset : 0),
						)
					: -1;
			}),
		)
		.toBeLessThan(8);
});
