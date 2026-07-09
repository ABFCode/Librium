import { CheckoutLink, CustomerPortalLink } from "@convex-dev/polar/react";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";
import { formatStorage } from "../lib/quotaErrors";

type AccountStorageDialogProps = {
	onClose: () => void;
};

// Cloud storage + supporter panel (library ⋯ menu → "Account & storage…").
// Reads are live Convex queries, so a checkout completing in another tab
// updates the plan line here without a reload.
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

	const used = storage?.usedBytes ?? null;
	const limit = storage?.limitBytes ?? null;
	const fraction =
		used !== null && limit !== null && limit > 0
			? Math.min(1, used / limit)
			: null;
	const isSupporter = storage?.plan === "supporter";
	const checkoutReady = Boolean(
		billing?.configured && billing?.supporterProductId,
	);

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
				className="surface w-full max-w-md p-6"
				onClick={(event) => event.stopPropagation()}
			>
				<h2 className="text-xl">Account & storage</h2>

				<div className="mt-4">
					<div className="flex items-baseline justify-between text-sm">
						<span className="text-[var(--muted)]">Cloud storage</span>
						<span>
							{used === null
								? "…"
								: limit === null
									? `${formatStorage(used)} used`
									: `${formatStorage(used)} of ${formatStorage(limit)}`}
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
					<p className="mt-2 text-xs text-[var(--muted-2)]">
						Cloud storage backs up your books and syncs them between devices.
						Books on this device are never limited, and you can export your
						EPUBs at any time.
					</p>
				</div>

				<div className="mt-5 border-t border-[var(--border)] pt-4">
					<div className="flex items-baseline justify-between text-sm">
						<span className="text-[var(--muted)]">Plan</span>
						<span>{isSupporter ? "Supporter" : "Free"}</span>
					</div>
					{isSupporter ? (
						<div className="mt-3">
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
								Billing, receipts, and cancellation are handled by Polar, our
								payment provider. Cancelling keeps everything you have — it only
								lowers the ceiling for new uploads.
							</p>
						</div>
					) : checkoutReady && billing?.supporterProductId ? (
						<div className="mt-3">
							<CheckoutLink
								polarApi={api.billing}
								productIds={[billing.supporterProductId]}
								embed={false}
								className="btn btn-primary h-9 text-xs"
							>
								Become a supporter
							</CheckoutLink>
							<p className="mt-2 text-xs text-[var(--muted-2)]">
								More cloud storage, and you keep a one-person project running.
								Checkout and receipts are handled by Polar.
							</p>
						</div>
					) : (
						<p className="mt-2 text-xs text-[var(--muted-2)]">
							Supporter subscriptions aren't available yet.
						</p>
					)}
				</div>

				<div className="mt-5 flex items-center justify-between">
					<div className="flex gap-3 text-xs text-[var(--muted-2)]">
						<a className="hover:underline" href="/terms">
							Terms
						</a>
						<a className="hover:underline" href="/privacy">
							Privacy
						</a>
					</div>
					<button
						type="button"
						className="btn btn-ghost text-xs"
						onClick={onClose}
					>
						Close
					</button>
				</div>
			</div>
		</div>
	);
};
