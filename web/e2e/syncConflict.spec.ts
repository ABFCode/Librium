import { expect, type Page, test } from "@playwright/test";
import { buildFixtureEpub } from "./fixtureEpub";

// Real two-device conflict journey. Device B edits while offline from an old
// server version; device A commits a newer status before B reconnects. B's
// stale queue must be rejected and both devices must converge without using
// either device's wall clock.

const email = `e2e-conflict-${Date.now()}@test.local`;
const password = "e2e-password-123";

const cardFor = (page: Page) =>
	page.locator(".book-card", { hasText: "Conflict Fixture" });

const setStatus = async (page: Page, status: string) => {
	await cardFor(page).getByRole("button", { name: "Open menu" }).click();
	await page
		.locator(".book-menu")
		.getByRole("button", { name: status })
		.click();
};

const statusSyncState = async (page: Page) =>
	page.evaluate(async () => {
		const userId = localStorage.getItem("librium:activeLocalUser");
		if (!userId) return null;
		const request = indexedDB.open(
			`librium:user:${encodeURIComponent(userId)}`,
		);
		const database: IDBDatabase = await new Promise((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const transaction = database.transaction("bookStatus", "readonly");
		const all = transaction.objectStore("bookStatus").getAll();
		const rows = await new Promise<
			Array<{ status: string | null; dirty: number; syncedServerTime?: number }>
		>((resolve, reject) => {
			all.onsuccess = () => resolve(all.result);
			all.onerror = () => reject(all.error);
		});
		database.close();
		const row = rows[0];
		return row
			? {
					status: row.status,
					dirty: row.dirty,
					serverTime: row.syncedServerTime ?? 0,
				}
			: null;
	});

test("stale offline status loses to newer server state", async ({
	page: deviceA,
	browser,
}) => {
	test.setTimeout(120_000);

	await deviceA.goto("/sign-up");
	await deviceA.getByPlaceholder("Name").fill("Conflict Reader");
	await deviceA.getByPlaceholder("Email").fill(email);
	await deviceA.getByPlaceholder("Password").fill(password);
	await deviceA.getByRole("button", { name: "Create account" }).click();
	await deviceA.waitForURL("**/library", { timeout: 20_000 });

	await deviceA.goto("/import");
	await deviceA.locator('input[type="file"][accept*="epub"]').setInputFiles({
		name: "conflict-fixture.epub",
		mimeType: "application/epub+zip",
		buffer: Buffer.from(buildFixtureEpub("Conflict Fixture")),
	});
	await deviceA.getByRole("button", { name: /Import 1 book/ }).click();
	await expect(deviceA.locator(".queue-status")).toHaveText(/Ready|Failed/, {
		timeout: 30_000,
	});
	await deviceA.goto("/library");
	await expect(cardFor(deviceA)).toBeVisible({ timeout: 15_000 });

	const contextB = await browser.newContext();
	const deviceB = await contextB.newPage();
	await deviceB.goto("/sign-in");
	await deviceB.getByPlaceholder("Email").fill(email);
	await deviceB.getByPlaceholder("Password").fill(password);
	await deviceB.getByRole("button", { name: "Sign in" }).click();
	await deviceB.waitForURL("**/library", { timeout: 20_000 });
	await expect(cardFor(deviceB)).toBeVisible({ timeout: 15_000 });

	// B queues an edit from the initial server version while disconnected.
	await contextB.setOffline(true);
	await setStatus(deviceB, "Want to read");
	await deviceB.getByRole("button", { name: "Want to read" }).click();
	await expect(cardFor(deviceB)).toBeVisible();

	// A commits a different status from that same base while online.
	await setStatus(deviceA, "Finished");
	await deviceA.getByRole("button", { name: "Finished" }).click();
	await expect(cardFor(deviceA)).toBeVisible();
	// The filtered card is optimistic local UI. Establish the causal order this
	// test claims by waiting until A's write is actually acknowledged before B
	// is allowed back online; otherwise a slow CI runner can let B win first.
	await expect
		.poll(() => statusSyncState(deviceA))
		.toEqual(
			expect.objectContaining({
				status: "finished",
				dirty: 0,
				serverTime: expect.any(Number),
			}),
		);

	// Reconnecting B flushes its stale queue. The server rejects it and the
	// reactive pull replaces B's optimistic value with A's accepted value.
	await contextB.setOffline(false);
	await deviceB.getByRole("button", { name: "All", exact: true }).click();
	await deviceB.getByRole("button", { name: "Finished" }).click();
	await expect(cardFor(deviceB)).toBeVisible({ timeout: 20_000 });
	await deviceB.getByRole("button", { name: "Want to read" }).click();
	await expect(cardFor(deviceB)).toHaveCount(0);

	await contextB.close();
});
