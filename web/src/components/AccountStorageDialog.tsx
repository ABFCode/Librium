import { CheckoutLink, CustomerPortalLink } from "@convex-dev/polar/react";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";
import { formatStorage } from "../lib/quotaErrors";
import { Icon } from "./Icon";

type AccountStorageDialogProps = {
	onClose: () => void;
};

const formatPrice = (price: {
	amountCents: number;
	currency: string;
	interval: string | null;
}): string => {
	const amount = new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: price.currency.toUpperCase(),
		minimumFractionDigits: price.amountCents % 100 === 0 ? 0 : 2,
	}).format(price.amountCents / 100);
	return price.interval ? `${amount}/${price.interval}` : amount;
};

// Cloud storage + supporter panel (library toolbar → account button, or the
// ⋯ menu). Reads are live Convex queries, so a checkout completing in
// another tab flips the plan here without a reload.
export const AccountStorageDialog = ({
	onClose,
}: AccountStorageDialogProps) => {
	const storage = useQuery(api.quota.getStorage);
	const billing = useQuery(api.billing.getConfig);

	useEffect(() => {
		const handleKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [onClose]);

	const isSupporter = storage?.plan === "supporter";
	const used = storage?.usedBytes ?? null;
	// The bar always compares against the CURRENT plan's allowance — even
	// before enforcement is on, that's the honest "how much room do I have"
	// number.
	const allowance =
		storage == null
			? null
			: (storage.limitBytes ??
				(isSupporter ? storage.supporterLimitBytes : storage.freeLimitBytes));
	const fraction =
		used !== null && allowance !== null && allowance > 0
			? Math.min(1, used / allowance)
			: null;
	const checkoutReady = Boolean(
		billing?.configured && billing?.supporterProductId,
	);
	const priceLabel = billing?.price ? formatPrice(billing.price) : null;

	const planCard = (
		plan: "free" | "supporter",
		limitBytes: number | null | undefined,
	) => {
		const current = (plan === "supporter") === isSupporter;
		return (
			<div
				className={`flex-1 rounded border px-4 py-3 ${
					current
						? "border-[var(--accent)]"
						: "border-[var(--border)] opacity-80"
				}`}
			>
				<div className="flex items-baseline justify-between">
					<span className="text-sm font-semibold">
						{plan === "supporter" ? "Supporter" : "Free"}
					</span>
					{current ? (
						<span className="text-[10px] uppercase tracking-wide text-[var(--accent)]">
							Your plan
						</span>
					) : null}
				</div>
				<div className="mt-1 text-lg">
					{limitBytes != null ? formatStorage(limitBytes) : "—"}
					<span className="text-xs text-[var(--muted-2)]"> cloud storage</span>
				</div>
				<div className="mt-1 text-xs text-[var(--muted-2)]">
					{plan === "supporter"
						? (priceLabel ?? "Yearly subscription")
						: "No cost, no time limit"}
				</div>
			</div>
		);
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close is a pointer nicety; Escape and the Close button cover keyboard users
		// biome-ignore lint/a11y/useKeyWithClickEvents: see above
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-6"
			onClick={onClose}
		>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: the click handler only stops backdrop-close propagation */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: see above */}
			<div
				className="surface w-full max-w-lg p-6"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="flex items-start justify-between">
					<div>
						<h2 className="text-xl">Account & storage</h2>
						<p className="mt-1 text-sm text-[var(--muted-2)]">
							Cloud storage backs up your books and syncs them between devices.
							Books already on a device always stay readable, and you can export
							your EPUBs at any time.
						</p>
					</div>
					<button type="button" className="icon-btn shrink-0" onClick={onClose}>
						<span className="sr-only">Close</span>
						<Icon name="close" />
					</button>
				</div>

				<div className="mt-5">
					<div className="flex items-baseline justify-between text-sm">
						<span className="text-[var(--muted)]">Your cloud library</span>
						<span>
							{used === null || allowance === null
								? "…"
								: `${formatStorage(used)} of ${formatStorage(allowance)}`}
						</span>
					</div>
					{fraction !== null ? (
						<div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-[var(--surface-2)]">
							<div
								className="h-full rounded bg-[var(--accent)]"
								style={{ width: `${Math.round(fraction * 100)}%` }}
							/>
						</div>
					) : null}
					{storage && !storage.enforced ? (
						<p className="mt-1.5 text-xs text-[var(--muted-2)]">
							Storage limits aren't enforced yet — this shows what your plan
							includes.
						</p>
					) : null}
				</div>

				<div className="mt-5 flex flex-col gap-3 sm:flex-row">
					{planCard("free", storage?.freeLimitBytes)}
					{planCard("supporter", storage?.supporterLimitBytes)}
				</div>

				<div className="mt-4">
					{isSupporter ? (
						<>
							<CustomerPortalLink
								polarApi={{
									generateCustomerPortalUrl:
										api.billing.generateCustomerPortalUrl,
								}}
								className="btn btn-ghost h-9 text-xs"
							>
								Manage subscription
							</CustomerPortalLink>
							<p className="mt-2 text-xs text-[var(--muted-2)]">
								Thank you for keeping a one-person project running. Billing,
								receipts, and cancellation are handled by Polar; cancelling
								keeps everything you have — it only lowers the ceiling for new
								uploads.
							</p>
						</>
					) : checkoutReady && billing?.supporterProductId ? (
						<>
							<CheckoutLink
								polarApi={api.billing}
								productIds={[billing.supporterProductId]}
								embed={false}
								className="btn btn-primary h-9 text-xs"
							>
								{priceLabel
									? `Become a supporter — ${priceLabel}`
									: "Become a supporter"}
							</CheckoutLink>
							<p className="mt-2 text-xs text-[var(--muted-2)]">
								{storage
									? `${formatStorage(storage.supporterLimitBytes)} of cloud storage instead of ${formatStorage(storage.freeLimitBytes)}, and you keep a one-person project running. `
									: ""}
								Checkout and receipts are handled by Polar, our payment
								provider.
							</p>
						</>
					) : (
						<p className="text-xs text-[var(--muted-2)]">
							Supporter subscriptions aren't available yet.
						</p>
					)}
				</div>

				<div className="mt-5 flex gap-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted-2)]">
					<a className="hover:underline" href="/terms">
						Terms
					</a>
					<a className="hover:underline" href="/privacy">
						Privacy
					</a>
				</div>
			</div>
		</div>
	);
};
