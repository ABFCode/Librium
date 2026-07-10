import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
	component: PrivacyPage,
});

// Complete data inventory, in plain language. Short because the app simply
// doesn't collect much.
function PrivacyPage() {
	return (
		<div className="min-h-screen px-6 pb-16 pt-8">
			<div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
				<div>
					<h1 className="text-3xl">Privacy policy</h1>
					<p className="mt-1 text-sm text-[var(--muted-2)]">
						Effective July 2026 · <Link to="/terms">Terms of service</Link>
					</p>
				</div>

				<section className="flex flex-col gap-4 text-sm leading-relaxed text-[var(--muted)]">
					<p>
						Librium stores the minimum it needs to be a reading app that syncs.
						There are no ads, no analytics or tracking scripts, and no sale or
						sharing of data with anyone, ever.
					</p>

					<h2 className="mt-2 text-lg text-[var(--ink)]">What is stored</h2>
					<p>
						<strong>Account:</strong> your email address and a password hash
						(authentication runs on Convex, and passwords are never stored in
						plaintext). <strong>Library:</strong> your book files and covers
						(Cloudflare R2), book metadata, reading progress, bookmarks,
						collections, and settings (Convex). All of it is keyed to your
						account and readable by no other user.{" "}
						<strong>On your device:</strong> the parsed books live in your
						browser's local storage (IndexedDB) so reading works offline.
						Deleting them there never deletes your cloud copy.
					</p>

					<h2 className="mt-2 text-lg text-[var(--ink)]">Payments</h2>
					<p>
						If you subscribe, checkout happens on Polar (polar.sh), the merchant
						of record. Card details go to Polar and its payment processors.
						Librium never sees or stores them. Librium keeps only your
						subscription status.
					</p>

					<h2 className="mt-2 text-lg text-[var(--ink)]">
						Deletion and export
					</h2>
					<p>
						Deleting a book removes it and its files everywhere, immediately.
						You can export every book as an EPUB at any time. If you want your
						whole account and its data deleted, email{" "}
						<a href="mailto:hello@librium.dev">hello@librium.dev</a> and it will
						be done within 30 days.
					</p>

					<h2 className="mt-2 text-lg text-[var(--ink)]">Infrastructure</h2>
					<p>
						Librium runs on Cloudflare Pages and R2 (static hosting and file
						storage) and Convex (database and sync). These providers process
						data on Librium's behalf under their own privacy terms. None of them
						get access beyond hosting the service.
					</p>
				</section>
			</div>
		</div>
	);
}
