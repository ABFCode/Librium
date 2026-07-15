import { expect, test } from "@playwright/test";
import { buildFixtureEpub } from "./fixtureEpub";

const email = `e2e-recovery-${Date.now()}@test.local`;
const password = "e2e-password-123";
const title = "Recovery Fixture";
const fixtureBytes = Buffer.from(buildFixtureEpub(title));

const fixtureFile = () => ({
	name: "recovery-fixture.epub",
	mimeType: "application/epub+zip",
	buffer: fixtureBytes,
});

test("failed cloud backup survives reload, retries, and deduplicates", async ({
	page,
}) => {
	test.setTimeout(120_000);

	await page.goto("/sign-up");
	await page.getByPlaceholder("Name").fill("Recovery Reader");
	await page.getByPlaceholder("Email").fill(email);
	await page.getByPlaceholder("Password").fill(password);
	await page.getByRole("button", { name: "Create account" }).click();
	await page.waitForURL("**/library", { timeout: 20_000 });

	// Fail the direct-to-R2 PUT while leaving Convex/auth traffic untouched.
	await page.route("**/*", async (route) => {
		if (route.request().method() === "PUT") {
			await route.abort("failed");
			return;
		}
		await route.continue();
	});

	await page.goto("/import");
	await page
		.locator('input[type="file"][accept*="epub"]')
		.setInputFiles(fixtureFile());
	await page.getByRole("button", { name: /Import 1 book/ }).click();
	await expect(page.locator(".queue-status")).toHaveText("Failed", {
		timeout: 30_000,
	});

	await page.goto("/library");
	await expect(page.locator(".book-card", { hasText: title })).toBeVisible({
		timeout: 15_000,
	});
	await expect(page.getByText(/cloud backup pending/)).toBeVisible();
	await page.reload();
	await expect(page.getByText(/cloud backup pending/)).toBeVisible({
		timeout: 15_000,
	});

	// Restore the upload path and retry the exact staged Blob/book ID.
	await page.unroute("**/*");
	await page.getByRole("button", { name: "Retry backup" }).click();
	await expect(page.getByText(/cloud backup pending/)).toHaveCount(0, {
		timeout: 30_000,
	});

	// A later re-import of identical bytes resolves to the attached book.
	await page.goto("/import");
	await page
		.locator('input[type="file"][accept*="epub"]')
		.setInputFiles(fixtureFile());
	await page.getByRole("button", { name: /Import 1 book/ }).click();
	await expect(page.locator(".queue-status")).toHaveText("Ready", {
		timeout: 30_000,
	});
	await page.goto("/library");
	await expect(page.locator(".book-card", { hasText: title })).toHaveCount(1, {
		timeout: 15_000,
	});
});
