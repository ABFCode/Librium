import { Polar } from "@convex-dev/polar";
import { components, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { internalAction, internalQuery, query } from "./_generated/server";
import { requireViewerUserId } from "./authHelpers";

// Polar is the merchant of record: it is the seller, handles global VAT/sales
// tax, refunds, and receipts, and pays out. This module is the only place
// that talks to it. Everything degrades to the free plan when Polar isn't
// configured (POLAR_ORGANIZATION_TOKEN unset), so the app runs unchanged
// without a billing account — and quota.ts fails open to "free" on any
// billing read error, so a Polar outage can never block reads or grant paid
// limits by accident.
//
// Deployment env vars:
//   POLAR_ORGANIZATION_TOKEN  org access token (sandbox or production org)
//   POLAR_WEBHOOK_SECRET      webhook endpoint secret
//   POLAR_SERVER              "sandbox" | "production" (default sandbox)
//   POLAR_PRODUCT_SUPPORTER   product id of the yearly Supporter subscription

export type Plan = "free" | "supporter";

export const isBillingConfigured = (): boolean =>
	Boolean(process.env.POLAR_ORGANIZATION_TOKEN);

const supporterProductId = (): string | undefined =>
	process.env.POLAR_PRODUCT_SUPPORTER || undefined;

export const polar = new Polar<DataModel>(components.polar, {
	// Products are optional here — the checkout link takes explicit product
	// ids, and plan resolution treats any active subscription as Supporter
	// (single-product org).
	getUserInfo: async (ctx): Promise<{ userId: string; email: string }> => {
		// Only Polar's action-based APIs (checkout, portal) call this, so
		// runQuery is always available. The explicit annotation breaks the
		// type cycle (polar → internal.billing → polar).
		const info: { userId: string; email: string } = await (
			ctx as ActionCtx
		).runQuery(internal.billing.viewerBillingInfo);
		return info;
	},
});

/**
 * Identity Polar bills against. Email is required: Polar customers are
 * keyed by it for receipts and the customer portal.
 */
export const viewerBillingInfo = internalQuery({
	args: {},
	handler: async (ctx) => {
		const userId = await requireViewerUserId(ctx);
		const user = await ctx.db.get(userId);
		const email = user?.email ?? (await ctx.auth.getUserIdentity())?.email;
		if (!email) {
			throw new Error(
				"Your account has no email address, which billing requires.",
			);
		}
		return { userId: userId as string, email };
	},
});

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/**
 * The user's current plan. Reads the component's webhook-synced subscription
 * table (no network call). Fail-open to "free": a missing/errored read must
 * never block anything, and can only under-grant, never over-grant.
 */
export const getPlan = async (
	ctx: QueryCtx | MutationCtx | ActionCtx,
	userId: Id<"users">,
): Promise<Plan> => {
	if (!isBillingConfigured()) {
		return "free";
	}
	try {
		const sub = await polar.getCurrentSubscription(ctx, {
			userId: userId as string,
		});
		return sub && ACTIVE_STATUSES.has(sub.status) ? "supporter" : "free";
	} catch (err) {
		// Fail open, but NEVER silently: the known trap is a subscription row
		// whose product isn't in the component's products table (products sync
		// via product.* webhooks or billing:syncProducts) — that throws here,
		// and swallowing it invisibly would leave a PAYING user on the free
		// plan. The warn is the tripwire.
		console.warn("[librium] plan lookup failed; treating as free:", err);
		return "free";
	}
};

/** Frontend billing config: whether checkout is possible and for what. */
export const getConfig = query({
	args: {},
	handler: async (ctx) => {
		const configured = isBillingConfigured();
		const productId = supporterProductId() ?? null;
		// Real price from the synced product catalog (billing:syncProducts /
		// product webhooks) so the UI never hardcodes an amount that could
		// drift from what checkout actually charges. Absent price is fine —
		// the dialog just omits it.
		let price: {
			amountCents: number;
			currency: string;
			interval: string | null;
		} | null = null;
		if (configured && productId) {
			try {
				const products = await polar.listProducts(ctx);
				const product = products.find((p) => p.id === productId);
				const withAmount = product?.prices?.find(
					(p) => typeof p.priceAmount === "number",
				);
				if (product && typeof withAmount?.priceAmount === "number") {
					price = {
						amountCents: withAmount.priceAmount,
						currency: withAmount.priceCurrency ?? "usd",
						interval: product.recurringInterval ?? null,
					};
				}
			} catch {
				// Catalog not synced yet — price stays null, checkout still works.
			}
		}
		return { configured, supporterProductId: productId, price };
	},
});

// Checkout + customer-portal actions consumed by the CheckoutLink /
// CustomerPortalLink components. These throw if Polar is unconfigured —
// the UI only renders them when getConfig says billing is live.
// Deliberately NOT exporting polar.api()'s cancel/changeCurrentSubscription:
// they'd be live public endpoints with no consumer — cancellation goes
// through the Polar customer portal, the flow the dialog copy promises.
export const { generateCheckoutLink, generateCustomerPortalUrl } = polar.api();

/**
 * Pull the org's product catalog into the component's tables. Run once
 * after configuring env vars (`npx convex run billing:syncProducts`):
 * getCurrentSubscription joins subscriptions against this table, and a
 * product created BEFORE the webhook endpoint existed is otherwise absent —
 * which would make a paying supporter resolve to the free plan.
 */
export const syncProducts = internalAction({
	args: {},
	handler: async (ctx) => {
		if (!isBillingConfigured()) {
			throw new Error("Polar is not configured (POLAR_ORGANIZATION_TOKEN).");
		}
		await polar.syncProducts(ctx);
	},
});
