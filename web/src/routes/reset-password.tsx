import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "../lib/auth-client";

// Landing page for the emailed reset link. Better Auth appends ?token=…
// (or ?error=… when the link is expired or already used).
export const Route = createFileRoute("/reset-password")({
	validateSearch: (search: Record<string, unknown>) => ({
		token: typeof search.token === "string" ? search.token : undefined,
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	component: ResetPassword,
});

function ResetPassword() {
	const { token, error: linkError } = Route.useSearch();
	const navigate = useNavigate();
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const invalidLink = !token || Boolean(linkError);

	const submit = async () => {
		if (!token) {
			return;
		}
		setError(null);
		setIsLoading(true);
		try {
			const result = await authClient.resetPassword({
				newPassword: password,
				token,
				fetchOptions: { throw: false },
			});
			if (result?.error) {
				setError(
					result.error.message ||
						"That link no longer works. Request a new one.",
				);
				return;
			}
			navigate({ to: "/sign-in" });
		} catch {
			setError("That link no longer works. Request a new one.");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-6 py-12">
			<div className="surface w-full max-w-sm p-8">
				<h1 className="text-2xl">Choose a new password</h1>
				{invalidLink ? (
					<>
						<p className="mt-3 text-sm text-[var(--muted)]">
							This reset link is invalid or has expired.
						</p>
						<p className="mt-4 text-xs text-[var(--muted-2)]">
							<Link className="underline" to="/forgot-password">
								Request a new link
							</Link>
						</p>
					</>
				) : (
					<div className="mt-6 space-y-3">
						<input
							className="input"
							type="password"
							placeholder="New password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter" && password && !isLoading) {
									void submit();
								}
							}}
						/>
						<button
							type="button"
							className="btn btn-primary w-full"
							onClick={submit}
							disabled={isLoading || !password}
						>
							{isLoading ? "Saving…" : "Set new password"}
						</button>
						{error ? (
							<p className="text-sm text-[var(--danger)]">{error}</p>
						) : null}
					</div>
				)}
			</div>
		</div>
	);
}
