import { expect, test } from "@playwright/test";
import { buildFixtureEpub } from "./fixtureEpub";

const stamp = Date.now();
const emailA = `e2e-isolation-a-${stamp}@test.local`;
const emailB = `e2e-isolation-b-${stamp}@test.local`;
const password = "e2e-password-123";
const titleA = "Account A Private Fixture";

const signUp = async (page: import("@playwright/test").Page, email: string) => {
	await page.goto("/sign-up");
	await page.getByPlaceholder("Name").fill("Isolation Reader");
	await page.getByPlaceholder("Email").fill(email);
	await page.getByPlaceholder("Password").fill(password);
	await page.getByRole("button", { name: "Create account" }).click();
	await page.waitForURL("**/library", { timeout: 20_000 });
	await page.getByPlaceholder(/Search/i).waitFor({ timeout: 20_000 });
};

test("account switches isolate and preserve local libraries", async ({
	page,
}) => {
	test.setTimeout(120_000);

	await signUp(page, emailA);
	await page.goto("/import");
	await page.locator('input[type="file"][accept*="epub"]').setInputFiles({
		name: "account-a.epub",
		mimeType: "application/epub+zip",
		buffer: Buffer.from(buildFixtureEpub(titleA)),
	});
	await page.getByRole("button", { name: /Import 1 book/ }).click();
	await expect(page.locator(".queue-status")).toHaveText(/Ready|Failed/, {
		timeout: 30_000,
	});
	await page.goto("/library");
	const cardA = page.locator(".book-card", { hasText: titleA });
	await expect(cardA).toBeVisible({ timeout: 15_000 });
	const readerHref = await cardA.getByRole("link").first().getAttribute("href");
	expect(readerHref).toBeTruthy();
	// Load the code-split reader route while online. Production cold-start
	// caching is covered separately; this test isolates user data semantics.
	await page.goto(readerHref as string);
	await expect(page.locator(".reader-content .reader-scroll")).toContainText(
		"Chapter one, paragraph 2",
		{ timeout: 20_000 },
	);
	await page.goto("/library");
	await expect(cardA).toBeVisible({ timeout: 15_000 });

	await page.getByRole("button", { name: "Sign out" }).click();
	await page
		.getByRole("link", { name: "Sign up" })
		.waitFor({ timeout: 20_000 });
	await signUp(page, emailB);
	await expect(page.locator(".book-card", { hasText: titleA })).toHaveCount(0);

	// Detect even a transient render of A's title while B opens A's deep link.
	await page.addInitScript((privateTitle) => {
		(
			window as unknown as { __leakedPrivateTitle: boolean }
		).__leakedPrivateTitle = false;
		new MutationObserver(() => {
			if (document.body?.innerText.includes(privateTitle)) {
				(
					window as unknown as { __leakedPrivateTitle: boolean }
				).__leakedPrivateTitle = true;
			}
		}).observe(document, {
			subtree: true,
			childList: true,
			characterData: true,
		});
	}, titleA);
	await page.goto(readerHref as string);
	await page.waitForURL("**/library", { timeout: 20_000 });
	expect(
		await page.evaluate(
			() =>
				(window as unknown as { __leakedPrivateTitle: boolean })
					.__leakedPrivateTitle,
		),
	).toBe(false);

	await page.getByRole("button", { name: "Sign out" }).click();
	await page
		.getByRole("link", { name: "Sign in" })
		.waitFor({ timeout: 20_000 });
	await page.goto("/sign-in");
	await page.getByPlaceholder("Email").fill(emailA);
	await page.getByPlaceholder("Password").fill(password);
	await page.getByRole("button", { name: "Sign in" }).click();
	await page.waitForURL("**/library", { timeout: 20_000 });
	await expect(page.locator(".book-card", { hasText: titleA })).toBeVisible({
		timeout: 20_000,
	});
	await expect
		.poll(() =>
			page.evaluate(
				() => localStorage.getItem("librium:wasAuthenticated") === "true",
			),
		)
		.toBe(true);

	const userDatabaseCount = await page.evaluate(async () => {
		const databases = await indexedDB.databases();
		return databases.filter((entry) => entry.name?.startsWith("librium:user:"))
			.length;
	});
	expect(userDatabaseCount).toBeGreaterThanOrEqual(2);

	// Prove A's parsed content survived both switches in A's active namespace.
	const retainedSections = await page.evaluate(async () => {
		const userId = localStorage.getItem("librium:activeLocalUser");
		if (!userId) return 0;
		const request = indexedDB.open(
			`librium:user:${encodeURIComponent(userId)}`,
		);
		const database: IDBDatabase = await new Promise((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const transaction = database.transaction("sections", "readonly");
		const all = transaction.objectStore("sections").getAll();
		const rows = await new Promise<unknown[]>((resolve, reject) => {
			all.onsuccess = () => resolve(all.result);
			all.onerror = () => reject(all.error);
		});
		database.close();
		return rows.length;
	});
	expect(retainedSections).toBeGreaterThan(0);
});
