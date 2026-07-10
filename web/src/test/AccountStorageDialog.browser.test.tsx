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
const GB = 1024 ** 3;

const baseStorage = {
	usedBytes: 120 * MB,
	limitBytes: null as number | null,
	plan: "free" as string,
	enforced: false,
	billingConfigured: false,
	freeLimitBytes: 250 * MB,
	supporterLimitBytes: 10 * GB,
};

describe("AccountStorageDialog", () => {
	beforeEach(() => {
		state.storage = null;
		state.billing = null;
	});

	it("shows usage against the plan allowance even before enforcement", async () => {
		state.storage = { ...baseStorage };
		state.billing = {
			configured: false,
			supporterProductId: null,
			price: null,
		};
		const screen = await render(<AccountStorageDialog onClose={vi.fn()} />);
		await expect.element(screen.getByText("120 MB of 250 MB")).toBeVisible();
		await expect.element(screen.getByText(/aren't enforced yet/)).toBeVisible();
		await expect
			.element(screen.getByText(/aren't available yet/))
			.toBeVisible();
	});

	it("shows both plan allowances and the real price on the checkout button", async () => {
		state.storage = { ...baseStorage, enforced: true, limitBytes: 250 * MB };
		state.billing = {
			configured: true,
			supporterProductId: "prod_123",
			price: { amountCents: 1200, currency: "usd", interval: "year" },
		};
		const screen = await render(<AccountStorageDialog onClose={vi.fn()} />);
		// Plan cards: free allowance and supporter allowance both visible.
		await expect.element(screen.getByText("Your plan")).toBeVisible();
		await expect
			.element(screen.getByText(/Become a supporter · \$12\/year/))
			.toBeVisible();
	});

	it("offers the customer portal to a supporter", async () => {
		state.storage = {
			...baseStorage,
			usedBytes: 1 * GB,
			plan: "supporter",
			enforced: true,
			limitBytes: 10 * GB,
			billingConfigured: true,
		};
		state.billing = {
			configured: true,
			supporterProductId: "prod_123",
			price: { amountCents: 1200, currency: "usd", interval: "year" },
		};
		const screen = await render(<AccountStorageDialog onClose={vi.fn()} />);
		await expect.element(screen.getByText("Manage subscription")).toBeVisible();
		await expect.element(screen.getByText("1.0 GB of 10.0 GB")).toBeVisible();
	});

	it("closes on Escape", async () => {
		const onClose = vi.fn();
		await render(<AccountStorageDialog onClose={onClose} />);
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
