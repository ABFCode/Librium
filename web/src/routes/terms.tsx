import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
	component: TermsPage,
});

// Plain-language terms. Librium is a one-person project; these terms are
// deliberately short and honest rather than exhaustive boilerplate.
function TermsPage() {
	return (
		<div className="min-h-screen px-6 pb-16 pt-8">
			<div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
				<div>
					<h1 className="text-3xl">Terms of service</h1>
					<p className="mt-1 text-sm text-[var(--muted-2)]">
						Effective July 2026 · <Link to="/privacy">Privacy policy</Link>
					</p>
				</div>

				<section className="flex flex-col gap-4 text-sm leading-relaxed text-[var(--muted)]">
					<p>
						Librium is a reading app for EPUBs and text files you already have.
						Your library is yours: books you import are stored for your account
						only, are never shared, published, or used for anything besides
						showing them back to you, and can be exported as EPUB files at any
						time.
					</p>

					<h2 className="mt-2 text-lg text-[var(--ink)]">Your content</h2>
					<p>
						You may only upload content you have the right to possess. Librium
						hosts no catalog, sells no books, and fetches no book content from
						anywhere — everything in your library got there because you put it
						there. You are responsible for what you upload.
					</p>

					<h2 className="mt-2 text-lg text-[var(--ink)]">
						Supporter subscriptions
					</h2>
					<p>
						The free plan includes a cloud-storage allowance for backup and
						sync; the Supporter subscription raises it. Payments are processed
						by Polar (polar.sh) as merchant of record — they are the seller, and
						handle checkout, receipts, taxes, and refunds.
					</p>
					<p>
						If a subscription ends, nothing is locked: every book you have stays
						readable, syncable, and exportable on every device. The smaller
						allowance only applies to adding new books. Books stored above the
						free allowance are kept for at least two years after a subscription
						ends; after that, Librium may ask you to export or trim the excess,
						by email and with at least three months to act before anything is
						removed.
					</p>

					<h2 className="mt-2 text-lg text-[var(--ink)]">
						If Librium ever shuts down
					</h2>
					<p>
						Librium is run by one person, and it would be dishonest to promise
						forever. So the promise is this instead: if the service ever winds
						down, uploads will go read-only with at least three months' notice,
						export will keep working for that entire period, and remaining paid
						time will be refunded. Your reading also degrades gracefully — books
						already on a device stay readable offline.
					</p>

					<h2 className="mt-2 text-lg text-[var(--ink)]">The usual</h2>
					<p>
						The service is provided as-is, without warranty. Don't abuse it (no
						attempts to exceed storage limits by manipulating uploads, no
						attacks on the service). Accounts used for abuse may be closed —
						with export offered first unless legally impossible.
					</p>
				</section>
			</div>
		</div>
	);
}
