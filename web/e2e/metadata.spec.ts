import { expect, type Page, test } from "@playwright/test";
import { buildFixtureEpub } from "./fixtureEpub";

// Metadata journey: edit details from the card menu, see the shelf update,
// and verify the edit survives content re-seeding (Remove download →
// Download to this device re-parses the EPUB, which must not resurrect the
// embedded metadata). The re-seed leg needs the EPUB in R2, so it only runs
// when the import reached "Ready" (CI's anonymous backend has no R2 creds —
// same tolerance as reading.spec.ts).

const email = `e2e-meta-${Date.now()}@test.local`;
const password = "e2e-password-123";

const cardFor = (page: Page, title: string) =>
	page.locator(".book-card", { hasText: title });

test.describe.configure({ mode: "serial" });

test("edit details updates the shelf and survives a re-download", async ({
	page,
}) => {
	test.setTimeout(120_000);

	await page.goto("/sign-up");
	await page.getByPlaceholder("Name").fill("E2E Editor");
	await page.getByPlaceholder("Email").fill(email);
	await page.getByPlaceholder("Password").fill(password);
	await page.getByRole("button", { name: "Create account" }).click();
	await page.waitForURL("**/library", { timeout: 20_000 });

	await page.goto("/import");
	await page.locator('input[type="file"][accept*="epub"]').setInputFiles({
		name: "e2e-fixture.epub",
		mimeType: "application/epub+zip",
		buffer: Buffer.from(buildFixtureEpub()),
	});
	await page.getByRole("button", { name: /Import 1 book/ }).click();
	await expect(page.locator(".queue-status")).toHaveText(/Ready|Failed/, {
		timeout: 30_000,
	});
	const uploaded = (
		await page.locator(".queue-status").textContent()
	)?.includes("Ready");

	await page.goto("/library");
	await expect(cardFor(page, "E2E Fixture")).toBeVisible({ timeout: 15_000 });

	// ── Edit title + author via the dialog ──────────────────────────────────
	await cardFor(page, "E2E Fixture")
		.getByRole("button", { name: "Open menu" })
		.click();
	await page.getByRole("button", { name: "Edit details…" }).click();
	await page.getByLabel("Title").fill("Renamed Fixture");
	await page.getByLabel("Author").fill("Real Author");
	await page.getByRole("button", { name: "Save", exact: true }).click();

	const renamed = cardFor(page, "Renamed Fixture");
	await expect(renamed).toBeVisible({ timeout: 15_000 });
	await expect(renamed).toContainText("Real Author");

	// ── The edit survives content re-seeding ────────────────────────────────
	if (uploaded) {
		await renamed.getByRole("button", { name: "Open menu" }).click();
		// Single-book removal is immediate (no confirmation dialog).
		await page.getByRole("button", { name: "Remove download" }).click();
		await expect(renamed.locator(".device-dot")).toHaveCount(0, {
			timeout: 10_000,
		});

		await renamed.getByRole("button", { name: "Open menu" }).click();
		await page.getByRole("button", { name: "Download to this device" }).click();
		await expect(renamed.locator(".device-dot")).toHaveCount(1, {
			timeout: 30_000,
		});
		// Smoke check only: the re-download path completes and the shelf still
		// shows the edited title. Note the shelf card renders from the SERVER
		// row while online, so this cannot by itself prove local identity
		// preservation — that logic is unit-tested via bookIdentityPatch
		// (src/test/seedBook.test.ts). Here we assert the local Dexie row too,
		// before the reconcile pass can repair it from the server.
		const localTitle = await page.evaluate(async () => {
			const userId = localStorage.getItem("librium:activeLocalUser");
			if (!userId) return null;
			const req = indexedDB.open(`librium:user:${encodeURIComponent(userId)}`);
			const dbConn: IDBDatabase = await new Promise((resolve, reject) => {
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => reject(req.error);
			});
			const row = await new Promise<{ title?: string } | undefined>(
				(resolve) => {
					const tx = dbConn.transaction("books", "readonly");
					const all = tx.objectStore("books").getAll();
					all.onsuccess = () =>
						resolve(
							(all.result as { title?: string }[]).find(
								(b) => b.title === "Renamed Fixture",
							),
						);
					all.onerror = () => resolve(undefined);
				},
			);
			dbConn.close();
			return row?.title ?? null;
		});
		expect(localTitle).toBe("Renamed Fixture");
	}

	// ── Persists across a reload ─────────────────────────────────────────────
	await page.reload();
	await expect(cardFor(page, "Renamed Fixture")).toBeVisible({
		timeout: 15_000,
	});
});
