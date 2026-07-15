import { expect, test } from "@playwright/test";
import { buildFixtureEpub } from "./fixtureEpub";

// Regression for the per-account IndexedDB lifecycle: signing out and back into
// the SAME account WITHOUT a full page reload must re-open that account's local
// database. The bug: sign-out swapped the live db to `librium:signed-out` but
// the boundary short-circuited on re-sign-in (mountedUserId === userId), so the
// app kept reading the empty signed-out database and the library looked wiped.
//
// This only reproduces via client-side navigation — every auth step here avoids
// page.goto so the SPA (and its stale mountedUserId) is never reloaded.

const stamp = Date.now();
const email = `e2e-resignin-${stamp}@test.local`;
const password = "e2e-password-123";
const title = "Resignin Fixture Book";

test("same-account sign-out then sign-in (no reload) re-opens the library", async ({
	page,
}) => {
	test.setTimeout(120_000);

	// Initial sign-up (a real navigation is fine here — it's the app's cold start).
	await page.goto("/sign-up");
	await page.getByPlaceholder("Name").fill("Resignin Reader");
	await page.getByPlaceholder("Email").fill(email);
	await page.getByPlaceholder("Password").fill(password);
	await page.getByRole("button", { name: "Create account" }).click();
	await page.waitForURL("**/library", { timeout: 20_000 });

	// Import a book so the account has visible local content to lose.
	await page.goto("/import");
	await page.locator('input[type="file"][accept*="epub"]').setInputFiles({
		name: "resignin.epub",
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

	// Sign out, then reach the sign-in form via the header LINK (client-side
	// navigation) — no page.goto, so the SPA is never reloaded.
	await page.getByRole("button", { name: "Sign out" }).click();
	await page.getByRole("link", { name: "Sign in" }).click();
	await page.getByPlaceholder("Email").fill(email);
	await page.getByPlaceholder("Password").fill(password);
	await page.getByRole("button", { name: "Sign in" }).click();
	await page.waitForURL("**/library", { timeout: 20_000 });

	// The account's book must be back — not an empty signed-out database.
	await expect(card).toBeVisible({ timeout: 20_000 });

	// And the active-user marker + database binding are restored, not left null.
	const activeUser = await page.evaluate(() =>
		localStorage.getItem("librium:activeLocalUser"),
	);
	expect(activeUser).not.toBeNull();
	const activeDbHasBook = await page.evaluate(async (userId) => {
		const request = indexedDB.open(
			`librium:user:${encodeURIComponent(userId)}`,
		);
		const database: IDBDatabase = await new Promise((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const count = await new Promise<number>((resolve, reject) => {
			const req = database
				.transaction("books", "readonly")
				.objectStore("books")
				.count();
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		database.close();
		return count;
	}, activeUser as string);
	expect(activeDbHasBook).toBeGreaterThan(0);
});
