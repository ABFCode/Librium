import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { buildFixtureEpub } from "./fixtureEpub";

const stamp = Date.now();
const email = `e2e-sync-durability-${stamp}@test.local`;
const password = "e2e-password-123";
const title = "Sync Durability Fixture";

const cardFor = (page: Page) => page.locator(".book-card", { hasText: title });

const openBook = async (page: Page) => {
	await page.goto("/library");
	await expect(cardFor(page)).toBeVisible({ timeout: 20_000 });
	await cardFor(page).getByRole("link").first().click();
	await expect(page.locator(".reader-topbar-title")).toHaveText(/Chapter I/, {
		timeout: 20_000,
	});
};

const openPreferences = async (page: Page) => {
	await page.locator('button[data-tooltip="Reader preferences"]').click();
	await expect(
		page.getByRole("dialog", { name: "Reader preferences" }),
	).toBeVisible();
};

const openBookmarks = async (page: Page) => {
	const drawer = page.locator(".reader-drawer");
	if (!(await drawer.evaluate((node) => node.classList.contains("is-open")))) {
		await page.locator('button[data-tooltip="Chapters"]').click();
	}
	await page.getByRole("button", { name: "Bookmarks", exact: true }).click();
};

const membershipState = async (page: Page) =>
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
		const transaction = database.transaction("collectionBooks", "readonly");
		const all = transaction.objectStore("collectionBooks").getAll();
		const rows = await new Promise<
			Array<{ dirty: number; deletedAt?: number; syncedServerTime?: number }>
		>((resolve, reject) => {
			all.onsuccess = () => resolve(all.result);
			all.onerror = () => reject(all.error);
		});
		database.close();
		const row = rows[0];
		return row
			? {
					dirty: row.dirty,
					deleted: row.deletedAt !== undefined,
					serverTime: row.syncedServerTime ?? 0,
				}
			: null;
	});

const readerSettingsState = async (page: Page) =>
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
		const transaction = database.transaction("settings", "readonly");
		const get = transaction.objectStore("settings").get("reader");
		const row = await new Promise<
			{ theme: string; fontFamily: string; dirtyFields: string[] } | undefined
		>((resolve, reject) => {
			get.onsuccess = () => resolve(get.result);
			get.onerror = () => reject(get.error);
		});
		database.close();
		return row ?? null;
	});

const openCollectionPicker = async (page: Page) => {
	await cardFor(page).getByRole("button", { name: "Open menu" }).click();
	await page
		.locator(".book-menu")
		.getByRole("button", { name: "Add to collection…" })
		.click();
	await expect(
		page.getByRole("dialog", { name: "Add to collection" }),
	).toBeVisible();
};

const signInSecondDevice = async (context: BrowserContext) => {
	const page = await context.newPage();
	await page.goto("/sign-in");
	await page.getByPlaceholder("Email").fill(email);
	await page.getByPlaceholder("Password").fill(password);
	await page.getByRole("button", { name: "Sign in" }).click();
	await page.waitForURL("**/library", { timeout: 20_000 });
	return page;
};

test("two devices converge across settings, bookmark deletes, and stale collection operations", async ({
	page: deviceA,
	browser,
}) => {
	test.setTimeout(240_000);

	await deviceA.goto("/sign-up");
	await deviceA.getByPlaceholder("Name").fill("Durability Reader");
	await deviceA.getByPlaceholder("Email").fill(email);
	await deviceA.getByPlaceholder("Password").fill(password);
	await deviceA.getByRole("button", { name: "Create account" }).click();
	await deviceA.waitForURL("**/library", { timeout: 20_000 });
	await deviceA.goto("/import");
	await deviceA.locator('input[type="file"][accept*="epub"]').setInputFiles({
		name: "sync-durability.epub",
		mimeType: "application/epub+zip",
		buffer: Buffer.from(buildFixtureEpub(title)),
	});
	await deviceA.getByRole("button", { name: /Import 1 book/ }).click();
	await expect(deviceA.locator(".queue-status")).toHaveText("Ready", {
		timeout: 30_000,
	});

	const contextB = await browser.newContext();
	const deviceB = await signInSecondDevice(contextB);
	await Promise.all([openBook(deviceA), openBook(deviceB)]);

	// Different fields edited from the same starting snapshot must merge, not
	// overwrite one another as a whole settings object.
	await openPreferences(deviceA);
	await deviceA.getByRole("button", { name: "Sepia", exact: true }).click();
	await deviceA.getByRole("button", { name: "Close", exact: true }).click();
	await openPreferences(deviceB);
	await deviceB.getByRole("button", { name: "Serif", exact: true }).click();
	await deviceB.getByRole("button", { name: "Close", exact: true }).click();

	await expect(deviceB.locator(".reader-shell")).toHaveClass(/theme-sepia/, {
		timeout: 20_000,
	});
	await expect
		.poll(() => readerSettingsState(deviceA))
		.toEqual(
			expect.objectContaining({
				theme: "sepia",
				fontFamily: "serif",
				dirtyFields: [],
			}),
		);
	await openPreferences(deviceA);
	await expect(
		deviceA.getByRole("button", { name: "Serif", exact: true }),
	).toHaveClass(/is-active/, { timeout: 20_000 });
	await expect(
		deviceA.getByRole("button", { name: "Sepia", exact: true }),
	).toHaveClass(/is-active/);
	await deviceA.getByRole("button", { name: "Close", exact: true }).click();

	// A bookmark created on one device appears on the other; deleting there
	// must propagate back without resurrection after a reload.
	deviceA.once("dialog", (dialog) => dialog.accept("Cross-device marker"));
	await deviceA.locator('button[data-tooltip="Bookmark"]').click();
	await openBookmarks(deviceB);
	await expect(
		deviceB.getByText("Cross-device marker", { exact: true }),
	).toBeVisible({
		timeout: 20_000,
	});
	await deviceB
		.getByRole("button", { name: "Remove bookmark", exact: true })
		.click();
	await expect(deviceB.getByText("No bookmarks yet.")).toBeVisible();
	await openBookmarks(deviceA);
	await expect(deviceA.getByText("No bookmarks yet.")).toBeVisible({
		timeout: 20_000,
	});
	await deviceA.reload();
	await openBookmarks(deviceA);
	await expect(deviceA.getByText("No bookmarks yet.")).toBeVisible();

	await Promise.all([deviceA.goto("/library"), deviceB.goto("/library")]);
	await Promise.all([
		expect(cardFor(deviceA)).toBeVisible({ timeout: 20_000 }),
		expect(cardFor(deviceB)).toBeVisible({ timeout: 20_000 }),
	]);

	await openCollectionPicker(deviceA);
	await deviceA.getByPlaceholder("New collection…").fill("Resilient shelf");
	await deviceA.getByRole("button", { name: "Create" }).click();
	await deviceA.getByRole("button", { name: "Done", exact: true }).click();
	await expect
		.poll(() => membershipState(deviceA))
		.toEqual(expect.objectContaining({ dirty: 0, deleted: false }));

	// Wait until B has observed the original membership, then queue a remove
	// offline. A performs a remove + intentional re-add while B is stale.
	await openCollectionPicker(deviceB);
	const collectionB = deviceB.getByRole("button", { name: /Resilient shelf/ });
	await expect(collectionB.locator(".menu-check svg")).toHaveCount(1, {
		timeout: 20_000,
	});
	await deviceB.getByRole("button", { name: "Done", exact: true }).click();
	await contextB.setOffline(true);
	await openCollectionPicker(deviceB);
	await collectionB.click();
	await expect(collectionB.locator(".menu-check svg")).toHaveCount(0);
	await deviceB.getByRole("button", { name: "Done", exact: true }).click();

	await openCollectionPicker(deviceA);
	const collectionA = deviceA.getByRole("button", { name: /Resilient shelf/ });
	await collectionA.click();
	await expect(collectionA.locator(".menu-check svg")).toHaveCount(0);
	await expect
		.poll(() => membershipState(deviceA))
		.toEqual(expect.objectContaining({ dirty: 0, deleted: true }));
	await collectionA.click();
	await expect(collectionA.locator(".menu-check svg")).toHaveCount(1);
	await deviceA.getByRole("button", { name: "Done", exact: true }).click();
	await expect
		.poll(() => membershipState(deviceA))
		.toEqual(expect.objectContaining({ dirty: 0, deleted: false }));

	// B's stale remove is rejected on reconnect because it never observed A's
	// later re-add. Both devices converge to present, including after reload.
	await contextB.setOffline(false);
	await openCollectionPicker(deviceB);
	await expect(collectionB.locator(".menu-check svg")).toHaveCount(1, {
		timeout: 20_000,
	});
	await deviceB.getByRole("button", { name: "Done", exact: true }).click();
	await deviceB.reload();
	await expect(cardFor(deviceB)).toBeVisible({ timeout: 20_000 });
	await openCollectionPicker(deviceB);
	await expect(collectionB.locator(".menu-check svg")).toHaveCount(1);

	await contextB.close();
});
