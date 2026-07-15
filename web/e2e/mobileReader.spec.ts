import { expect, test } from "@playwright/test";
import { buildFixtureEpub } from "./fixtureEpub";

const reader = (page: import("@playwright/test").Page) =>
	page.locator(".reader-main-scroll");

test("mobile reader has deterministic chrome and true chapter starts", async ({
	browser,
}) => {
	test.setTimeout(180_000);
	const context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		hasTouch: true,
	});
	const page = await context.newPage();
	const email = `e2e-mobile-reader-${Date.now()}@test.local`;

	await page.goto("/sign-up");
	await page.getByPlaceholder("Name").fill("Mobile Reader");
	await page.getByPlaceholder("Email").fill(email);
	await page.getByPlaceholder("Password").fill("e2e-password-123");
	await page.getByRole("button", { name: "Create account" }).click();
	await page.waitForURL("**/library", { timeout: 20_000 });

	await page.goto("/import");
	await page.locator('input[type="file"][accept*="epub"]').setInputFiles({
		name: "mobile-reader.epub",
		mimeType: "application/epub+zip",
		buffer: Buffer.from(buildFixtureEpub()),
	});
	await page.getByRole("button", { name: /Import 1 book/ }).click();
	await expect(page.locator(".queue-status")).toHaveText(/Ready|Failed/, {
		timeout: 30_000,
	});

	await page.goto("/library");
	const card = page.locator(".book-card", { hasText: "E2E Fixture" });
	await expect(card).toBeVisible({ timeout: 15_000 });
	await card.getByRole("link").first().click();
	await expect(reader(page)).toContainText("Chapter one, paragraph 2", {
		timeout: 20_000,
	});
	// Reload covers the slower progress-restore path where the scroller mounts
	// after the section id; the chrome listener must still attach deterministically.
	await page.reload();
	await expect(reader(page)).toContainText("Chapter one, paragraph 2");
	await expect(
		reader(page).locator("[data-chunk-index]").first(),
	).toBeVisible();
	await page.waitForTimeout(500);
	expect(
		await page
			.locator(".reader-top-mobile-secondary")
			.evaluateAll((nodes) =>
				nodes.every((node) => getComputedStyle(node).display === "none"),
			),
	).toBe(true);
	const topContents = page.locator(
		'.reader-topbar button[data-tooltip="Chapters"]',
	);
	await expect(topContents).toBeVisible();
	await expect(page.locator(".reader-botbar button")).toHaveCount(3);
	await expect(page.locator(".reader-botbar-center .sr-only")).toHaveText(
		"Reading progress:",
	);
	await expect(page.locator(".reader-botbar-settings")).toBeVisible();
	const bottomPrevious = page.locator(
		'.reader-botbar [aria-label="Previous chapter"]',
	);
	const bottomNext = page.locator('.reader-botbar [aria-label="Next chapter"]');
	await expect(bottomPrevious).toBeDisabled();
	await expect(bottomNext).toBeEnabled();

	// A chapter start remains the true scroll origin after the arrival progress
	// write, and the first content block clears the fixed toolbar.
	await page.waitForTimeout(800);
	expect(await reader(page).evaluate((element) => element.scrollTop)).toBe(0);
	const startGeometry = await page.evaluate(() => {
		const topbar = document.querySelector(".reader-topbar") as HTMLElement;
		const first = document.querySelector(
			".reader-main-scroll [data-chunk-index]",
		) as HTMLElement;
		return {
			topbarBottom: topbar.getBoundingClientRect().bottom,
			firstTop: first.getBoundingClientRect().top,
		};
	});
	expect(startGeometry.firstTop).toBeGreaterThanOrEqual(
		startGeometry.topbarBottom,
	);

	// Persistent mobile chapter controls are immediately discoverable, respect
	// boundaries, and treat both directions as explicit chapter-start actions.
	await bottomNext.click();
	await expect(page.locator(".reader-topbar-title")).toHaveText(/Chapter II/);
	await page.waitForTimeout(800);
	expect(await reader(page).evaluate((element) => element.scrollTop)).toBe(0);
	await expect(bottomPrevious).toBeEnabled();
	await bottomPrevious.click();
	await expect(page.locator(".reader-topbar-title")).toHaveText(/Chapter I/);
	await page.waitForTimeout(800);
	expect(await reader(page).evaluate((element) => element.scrollTop)).toBe(0);
	await expect(bottomPrevious).toBeDisabled();

	// Small scroll increments accumulate into one deliberate gesture.
	await reader(page).evaluate(async (element) => {
		for (let step = 0; step < 20; step += 1) {
			element.scrollTop += 4;
			await new Promise(requestAnimationFrame);
		}
	});
	await expect(page.locator(".reader-topbar")).toHaveClass(/is-hidden/);
	await expect(page.locator(".reader-botbar")).toHaveClass(/is-hidden/);

	await reader(page).evaluate((element) => {
		element.scrollTop = 0;
	});
	await expect(page.locator(".reader-topbar")).not.toHaveClass(/is-hidden/);

	// Only a central clean tap toggles chrome; an edge tap remains inert.
	const bounds = await reader(page).boundingBox();
	expect(bounds).not.toBeNull();
	if (!bounds) {
		throw new Error("reader bounds unavailable");
	}
	await page.touchscreen.tap(
		bounds.x + bounds.width / 2,
		bounds.y + bounds.height / 2,
	);
	await expect(page.locator(".reader-topbar")).toHaveClass(/is-hidden/);
	await expect(page.locator(".reader-botbar")).toHaveClass(/is-hidden/);
	await page.touchscreen.tap(bounds.x + 8, bounds.y + bounds.height / 2);
	await expect(page.locator(".reader-topbar")).toHaveClass(/is-hidden/);
	await expect(page.locator(".reader-botbar")).toHaveClass(/is-hidden/);
	await page.touchscreen.tap(
		bounds.x + bounds.width / 2,
		bounds.y + bounds.height / 2,
	);
	await expect(page.locator(".reader-topbar")).not.toHaveClass(/is-hidden/);
	await expect(page.locator(".reader-botbar")).not.toHaveClass(/is-hidden/);
	await expect(page.locator(".reader-botbar-settings")).toBeVisible();
	await expect
		.poll(() =>
			page.evaluate(() => {
				const viewportBottom = window.visualViewport
					? window.visualViewport.offsetTop + window.visualViewport.height
					: innerHeight;
				const bottomControl = document
					.querySelector(".reader-botbar-settings")
					?.getBoundingClientRect();
				return (bottomControl?.bottom ?? 0) - viewportBottom;
			}),
		)
		.toBeLessThanOrEqual(1);

	// A TOC choice and the chapter-end continuation both start at zero.
	await topContents.click();
	await page.locator('.reader-drawer [data-index="1"]').click();
	await expect(page.locator(".reader-topbar-title")).toHaveText(/Chapter II/);
	await page.waitForTimeout(800);
	expect(await reader(page).evaluate((element) => element.scrollTop)).toBe(0);

	// Search is an explicit destination: the matching paragraph must clear the
	// fixed toolbar, and selecting it dismisses the sheet.
	await topContents.click();
	await page.getByRole("button", { name: "Search", exact: true }).click();
	await page
		.getByPlaceholder("Search the whole book…")
		.fill("xylophone-harvest");
	const searchResult = page.locator(".reader-drawer .reader-row", {
		hasText: "xylophone-harvest lives right here",
	});
	await expect(searchResult).toBeVisible({ timeout: 10_000 });
	await searchResult.click();
	await expect(page.locator(".reader-drawer")).not.toHaveClass(/is-open/);
	await page.waitForTimeout(500);
	if (
		await page
			.locator(".reader-topbar")
			.evaluate((node) => node.classList.contains("is-hidden"))
	) {
		const searchBounds = await reader(page).boundingBox();
		if (!searchBounds) {
			throw new Error("reader bounds unavailable after search navigation");
		}
		await page.touchscreen.tap(
			searchBounds.x + searchBounds.width / 2,
			searchBounds.y + searchBounds.height / 2,
		);
	}
	await expect(page.locator(".reader-topbar")).not.toHaveClass(/is-hidden/);
	const searchGeometry = await page.evaluate(() => {
		const topbar = document.querySelector(".reader-topbar") as HTMLElement;
		const match = Array.from(
			document.querySelectorAll(".reader-main-scroll [data-chunk-index]"),
		).find((node) =>
			node.textContent?.includes("xylophone-harvest lives right here"),
		);
		return {
			topbarBottom: topbar.getBoundingClientRect().bottom,
			matchTop: (match as HTMLElement).getBoundingClientRect().top,
		};
	});
	expect(searchGeometry.matchTop).toBeGreaterThanOrEqual(
		searchGeometry.topbarBottom,
	);

	// Bookmarking opens the bookmark list. Choosing the saved location closes
	// it, while the primary Contents control always reopens on Chapters.
	page.once("dialog", (dialog) => dialog.accept("Search location"));
	await page.locator('.reader-topbar button[data-tooltip="Bookmark"]').click();
	await expect(page.locator(".reader-drawer")).toHaveClass(/is-open/);
	await expect(
		page.getByRole("button", { name: "Bookmarks", exact: true }),
	).toHaveClass(/is-active/);
	await page
		.locator('.reader-drawer [role="button"].surface-soft')
		.first()
		.click();
	await expect(page.locator(".reader-drawer")).not.toHaveClass(/is-open/);
	await topContents.click();
	await expect(
		page.getByRole("button", { name: "Chapters", exact: true }),
	).toHaveClass(/is-active/);
	await page
		.locator(".reader-drawer-backdrop")
		.click({ position: { x: 5, y: 5 } });

	// The preferences controls reflow at the narrowest supported phone size.
	await page.setViewportSize({ width: 320, height: 800 });
	await expect(page.locator(".reader-botbar button")).toHaveCount(3);
	const bottomBarGeometry = await page
		.locator(".reader-botbar")
		.evaluate((bar) => ({
			fits: bar.scrollWidth <= bar.clientWidth,
			buttonWidths: Array.from(
				bar.querySelectorAll("button"),
				(button) => button.getBoundingClientRect().width,
			),
		}));
	expect(bottomBarGeometry.fits).toBe(true);
	expect(bottomBarGeometry.buttonWidths.every((width) => width >= 44)).toBe(
		true,
	);
	// Open directly because the earlier bookmark jump deliberately left the
	// immersive controls hidden; activation itself was already exercised above.
	await page
		.locator(".reader-botbar-settings")
		.evaluate((node: HTMLButtonElement) => node.click());
	const preferences = page.locator(".reader-preferences-panel");
	await expect(preferences).toBeVisible();
	const preferencesBounds = await preferences.boundingBox();
	expect(preferencesBounds).not.toBeNull();
	if (preferencesBounds) {
		expect(preferencesBounds.x).toBeGreaterThanOrEqual(0);
		expect(preferencesBounds.x + preferencesBounds.width).toBeLessThanOrEqual(
			320,
		);
		expect(preferencesBounds.y).toBeGreaterThanOrEqual(0);
		expect(preferencesBounds.y + preferencesBounds.height).toBeLessThanOrEqual(
			800,
		);
	}
	expect(
		await preferences.evaluate(
			(element) => element.scrollWidth <= element.clientWidth,
		),
	).toBe(true);
	await page.getByRole("button", { name: "Close", exact: true }).click();
	await page.setViewportSize({ width: 390, height: 844 });

	await reader(page).evaluate((element) => {
		element.scrollTop = element.scrollHeight;
	});
	await expect(page.locator(".reader-botbar")).toHaveClass(/is-hidden/);
	const endBounds = await reader(page).boundingBox();
	if (!endBounds) {
		throw new Error("reader bounds unavailable at chapter end");
	}
	await page.touchscreen.tap(
		endBounds.x + endBounds.width / 2,
		endBounds.y + endBounds.height / 2,
	);
	await expect(page.locator(".reader-topbar")).not.toHaveClass(/is-hidden/);
	await expect(page.locator(".reader-botbar")).not.toHaveClass(/is-hidden/);
	await expect
		.poll(() =>
			page.evaluate(() => {
				const turnBottom =
					document
						.querySelector(".reader-chapter-end .reader-turn.is-next")
						?.getBoundingClientRect().bottom ?? 0;
				const barTop =
					document.querySelector(".reader-botbar")?.getBoundingClientRect()
						.top ?? 0;
				return turnBottom - barTop;
			}),
		)
		.toBeLessThanOrEqual(1);
	await page.locator(".reader-chapter-end .reader-turn.is-next").click();
	await expect(page.locator(".reader-topbar-title")).toHaveText(/Chapter III/);
	await page.waitForTimeout(800);
	expect(await reader(page).evaluate((element) => element.scrollTop)).toBe(0);

	// The same phone reader remains active after a landscape rotation.
	await page.setViewportSize({ width: 844, height: 390 });
	await expect(page.locator(".reader-botbar")).toHaveCSS("display", "flex");
	await expect(page.locator(".reader-botbar button")).toHaveCount(3);
	await expect(page.locator(".reader-topbar")).toHaveCSS("position", "fixed");
	await expect(page.locator(".reader-top-progress")).toHaveCSS(
		"display",
		"none",
	);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);

	await context.close();
});
