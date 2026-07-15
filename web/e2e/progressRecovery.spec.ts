import { expect, type Page, test } from "@playwright/test";
import { buildFixtureEpub } from "./fixtureEpub";

const password = "e2e-password-123";
const title = "Progress Recovery Fixture";

const cardFor = (page: Page) => page.locator(".book-card", { hasText: title });
const readerTitle = (page: Page) => page.locator(".reader-topbar-title");

const progressState = async (page: Page) =>
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
		const transaction = database.transaction("progress", "readonly");
		const all = transaction.objectStore("progress").getAll();
		const rows = await new Promise<
			Array<{ sectionIndex: number; dirty: number; syncedServerTime: number }>
		>((resolve, reject) => {
			all.onsuccess = () => resolve(all.result);
			all.onerror = () => reject(all.error);
		});
		database.close();
		return rows[0] ?? null;
	});

const waitForSyncedSection = async (page: Page, sectionIndex: number) =>
	expect
		.poll(() => progressState(page), { timeout: 20_000 })
		.toEqual(
			expect.objectContaining({
				sectionIndex,
				dirty: 0,
			}),
		);

const openBook = async (page: Page, expected: RegExp) => {
	await page.goto("/library");
	await expect(cardFor(page)).toBeVisible({ timeout: 20_000 });
	await cardFor(page).getByRole("link").first().click();
	await expect(readerTitle(page)).toHaveText(expected, { timeout: 20_000 });
};

const chooseChapter = async (page: Page, index: number) => {
	const phoneControl = page.locator(".reader-botbar-center");
	if (await phoneControl.isVisible()) {
		await phoneControl.click();
	} else {
		await page.locator('button[data-tooltip="Chapters"]').click();
	}
	await page.locator(`.reader-drawer [data-index="${index}"]`).click();
};

const openHistory = async (page: Page) => {
	await page.goto("/library");
	await expect(cardFor(page)).toBeVisible({ timeout: 20_000 });
	await cardFor(page).getByRole("button", { name: "Open menu" }).click();
	await page.getByRole("button", { name: "Reading history…" }).click();
	await expect(
		page.getByRole("dialog", { name: "Reading history" }),
	).toBeVisible();
	await expect(page.getByText("Loading reading history…")).toHaveCount(0, {
		timeout: 20_000,
	});
};

const restoreSection = async (page: Page, sectionIndex: number) => {
	const row = page.locator(`[data-history-section="${sectionIndex}"]`).first();
	await expect(row).toBeVisible({ timeout: 20_000 });
	await row.getByRole("button", { name: "Restore" }).click();
	await expect(page.getByRole("status")).toContainText(/restored/i, {
		timeout: 20_000,
	});
};

test("reading history restores, survives offline interruption, converges, and can be undone", async ({
	page: computer,
	browser,
}, testInfo) => {
	test.setTimeout(240_000);
	const email = `e2e-progress-recovery-${Date.now()}-${testInfo.workerIndex}-${testInfo.repeatEachIndex}@test.local`;

	await computer.goto("/sign-up");
	await computer.getByPlaceholder("Name").fill("Recovery Reader");
	await computer.getByPlaceholder("Email").fill(email);
	await computer.getByPlaceholder("Password").fill(password);
	await computer.getByRole("button", { name: "Create account" }).click();
	await computer.waitForURL("**/library", { timeout: 20_000 });

	await computer.goto("/import");
	await computer.locator('input[type="file"][accept*="epub"]').setInputFiles({
		name: "progress-recovery.epub",
		mimeType: "application/epub+zip",
		buffer: Buffer.from(buildFixtureEpub(title)),
	});
	await computer.getByRole("button", { name: /Import 1 book/ }).click();
	await expect(computer.locator(".queue-status")).toHaveText("Ready", {
		timeout: 30_000,
	});

	await openBook(computer, /Chapter I/);
	await waitForSyncedSection(computer, 0);
	await chooseChapter(computer, 2);
	await expect(readerTitle(computer)).toHaveText(/Chapter III/, {
		timeout: 20_000,
	});
	await waitForSyncedSection(computer, 2);

	// A normal chapter move preserved the previous place. Restore it and prove
	// both the server state and the durable local cache now open Chapter I.
	await openHistory(computer);
	await expect(
		computer
			.getByRole("region", { name: "Current reading position" })
			.getByText(/Chapter III/),
	).toBeVisible();
	await restoreSection(computer, 0);
	await computer.getByRole("button", { name: "Close" }).click();
	await openBook(computer, /Chapter I/);
	await waitForSyncedSection(computer, 0);

	const phoneContext = await browser.newContext({
		viewport: { width: 390, height: 844 },
		hasTouch: true,
	});
	const phone = await phoneContext.newPage();
	await phone.goto("/sign-in");
	await phone.getByPlaceholder("Email").fill(email);
	await phone.getByPlaceholder("Password").fill(password);
	await phone.getByRole("button", { name: "Sign in" }).click();
	await phone.waitForURL("**/library", { timeout: 20_000 });
	await openBook(phone, /Chapter I/);
	await chooseChapter(phone, 1);
	await expect(readerTitle(phone)).toHaveText(/Chapter II/, {
		timeout: 20_000,
	});
	await waitForSyncedSection(phone, 1);

	// The computer sees the phone's newer position and correctly labels its
	// origin. Losing the network leaves the history readable but non-destructive.
	await openHistory(computer);
	await expect(
		computer
			.getByRole("region", { name: "Current reading position" })
			.getByText(/Phone/),
	).toBeVisible({ timeout: 20_000 });
	await computer.context().setOffline(true);
	await expect(computer.getByText(/You’re offline/)).toBeVisible();
	await expect(
		computer
			.locator('[data-history-section="2"]')
			.first()
			.getByRole("button", { name: "Restore" }),
	).toBeDisabled();
	await computer.context().setOffline(false);
	await expect(computer.getByText(/You’re offline/)).toHaveCount(0);

	// Restore Chapter III. The displaced phone position becomes the newest
	// recovery point, so restoring it again is a safe undo.
	await restoreSection(computer, 2);
	await computer.getByRole("button", { name: "Close" }).click();
	await openBook(computer, /Chapter III/);
	await phone.reload();
	await expect(readerTitle(phone)).toHaveText(/Chapter III/, {
		timeout: 20_000,
	});

	await openHistory(computer);
	await expect(
		computer.locator('[data-history-section="1"]').first(),
	).toContainText(/Saved before a restore/);
	await restoreSection(computer, 1);
	await computer.getByRole("button", { name: "Close" }).click();
	await openBook(computer, /Chapter II/);
	await phone.reload();
	await expect(readerTitle(phone)).toHaveText(/Chapter II/, {
		timeout: 20_000,
	});

	await phoneContext.close();
});
