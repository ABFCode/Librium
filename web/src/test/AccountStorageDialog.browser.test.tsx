import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { AccountStorageDialog } from "../components/AccountStorageDialog";

const state = vi.hoisted(() => ({
	storage: null as unknown,
	billing: null as unknown,
}));

vi.mock("convex/react", async () => {
	const { getFunctionName: nameFn } = await import("convex/server");
	const { api: apiRef } = await import("../../convex/_generated/api");
	return {
		useQuery: (ref: unknown) => {
			const name = nameFn(ref as never);
			if (name === nameFn(apiRef.quota.getStorage as never)) {
				return state.storage;
			}
			if (name === nameFn(apiRef.billing.getConfig as never)) {
				return state.billing;
			}
			return undefined;
		},
	};
});

// Polar's real components need a live ConvexProvider (they resolve their own
// convex/react instance, past this file's mock). The dialog's job is choosing
// WHICH affordance to render — stub them to inert anchors.
vi.mock("@convex-dev/polar/react", () => ({
	CheckoutLink: ({ children }: PropsWithChildren) => (
		<a href="/#">{children}</a>
	),
	CustomerPortalLink: ({ children }: PropsWithChildren) => (
		<a href="/#">{children}</a>
	),
}));

const MB = 1024 * 1024;

describe("AccountStorageDialog", () => {
	beforeEach(() => {
		state.storage = null;
		state.billing = null;
	});

	it("shows usage without a limit while enforcement is off", async () => {
		state.storage = {
			usedBytes: 120 * MB,
			limitBytes: null,
			plan: "free",
			enforced: false,
			billingConfigured: false,
		};
		state.billing = { configured: false, supporterProductId: null };
		const screen = await render(<AccountStorageDialog onClose={vi.fn()} />);
		await expect.element(screen.getByText("120 MB used")).toBeVisible();
		await expect
			.element(screen.getByText(/aren't available yet/))
			.toBeVisible();
	});

	it("offers checkout to a free user when billing is live", async () => {
		state.storage = {
			usedBytes: 200 * MB,
			limitBytes: 250 * MB,
			plan: "free",
			enforced: true,
			billingConfigured: true,
		};
		state.billing = { configured: true, supporterProductId: "prod_123" };
		const screen = await render(<AccountStorageDialog onClose={vi.fn()} />);
		await expect.element(screen.getByText("200 MB of 250 MB")).toBeVisible();
		await expect.element(screen.getByText("Become a supporter")).toBeVisible();
	});

	it("offers the customer portal to a supporter", async () => {
		state.storage = {
			usedBytes: 1 * 1024 ** 3,
			limitBytes: 10 * 1024 ** 3,
			plan: "supporter",
			enforced: true,
			billingConfigured: true,
		};
		state.billing = { configured: true, supporterProductId: "prod_123" };
		const screen = await render(<AccountStorageDialog onClose={vi.fn()} />);
		await expect.element(screen.getByText("Supporter")).toBeVisible();
		await expect.element(screen.getByText("Manage subscription")).toBeVisible();
	});

	it("closes on Escape", async () => {
		state.storage = null;
		state.billing = null;
		const onClose = vi.fn();
		await render(<AccountStorageDialog onClose={onClose} />);
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
