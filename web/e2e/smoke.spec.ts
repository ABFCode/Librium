import { expect, test } from "@playwright/test";

test("sign-in page loads", async ({ page }) => {
	await page.goto("/sign-in");
	await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
	const form = page.locator("form");
	await expect(form.getByPlaceholder("Email")).toHaveAttribute(
		"autocomplete",
		"email",
	);
	await expect(form.getByPlaceholder("Password")).toHaveAttribute(
		"autocomplete",
		"current-password",
	);
	await expect(form.getByRole("button", { name: "Sign in" })).toHaveAttribute(
		"type",
		"submit",
	);
});

test("sign-up page loads", async ({ page }) => {
	await page.goto("/sign-up");
	await expect(
		page.getByRole("heading", { name: "Create an account" }),
	).toBeVisible();
	const form = page.locator("form");
	await expect(form.getByPlaceholder("Name")).toHaveAttribute(
		"autocomplete",
		"name",
	);
	await expect(form.getByPlaceholder("Email")).toHaveAttribute(
		"autocomplete",
		"email",
	);
	await expect(form.getByPlaceholder("Password")).toHaveAttribute(
		"autocomplete",
		"new-password",
	);
	await expect(
		form.getByRole("button", { name: "Create account" }),
	).toHaveAttribute("type", "submit");
});
