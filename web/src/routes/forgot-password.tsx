import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/forgot-password")({
	component: ForgotPassword,
});

function ForgotPassword() {
	const [email, setEmail] = useState("");
	const [sent, setSent] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const submit = async () => {
		setError(null);
		setIsLoading(true);
		try {
			await authClient.requestPasswordReset({
				email,
				redirectTo: `${window.location.origin}/reset-password`,
			});
			// Same confirmation whether or not the account exists, so this form
			// can't be used to probe which emails are registered.
			setSent(true);
		} catch {
			setError("Something went wrong. Try again in a minute.");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-6 py-12">
			<div className="surface w-full max-w-sm p-8">
				<h1 className="text-2xl">Reset password</h1>
				{sent ? (
					<p className="mt-3 text-sm text-[var(--muted)]">
						If an account exists for {email}, a reset link is on its way. Check
						your inbox.
					</p>
				) : (
					<>
						<p className="mt-1 text-sm text-[var(--muted-2)]">
							Enter your account email and we'll send a reset link.
						</p>
						<div className="mt-6 space-y-3">
							<input
								className="input"
								type="email"
								placeholder="Email"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter" && email && !isLoading) {
										void submit();
									}
								}}
							/>
							<button
								type="button"
								className="btn btn-primary w-full"
								onClick={submit}
								disabled={isLoading || !email}
							>
								{isLoading ? "Sending…" : "Send reset link"}
							</button>
							{error ? (
								<p className="text-sm text-[var(--danger)]">{error}</p>
							) : null}
						</div>
					</>
				)}
				<p className="mt-4 text-xs text-[var(--muted-2)]">
					<Link className="underline" to="/sign-in">
						Back to sign in
					</Link>
				</p>
			</div>
		</div>
	);
}
