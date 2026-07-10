import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/sign-in")({
	component: SignIn,
});

function SignIn() {
	const navigate = useNavigate();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const submit = async () => {
		setError(null);
		setIsLoading(true);
		try {
			const result = await authClient.signIn.email({
				email,
				password,
				fetchOptions: { throw: false },
			});
			if (result?.error) {
				setError(result.error.message || "Unable to sign in");
				return;
			}
			navigate({ to: "/library" });
		} catch (err) {
			const message =
				err && typeof err === "object" && "data" in err
					? JSON.stringify(err.data)
					: err instanceof Error
						? err.message
						: "Unable to sign in";
			setError(message);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-6 py-12">
			<div className="surface w-full max-w-sm p-8">
				<h1 className="text-2xl">Sign in</h1>
				<p className="mt-1 text-sm text-[var(--muted-2)]">
					Pick up where you left off.
				</p>
				<div className="mt-6 space-y-3">
					<input
						className="input"
						type="email"
						placeholder="Email"
						value={email}
						onChange={(event) => setEmail(event.target.value)}
					/>
					<input
						className="input"
						type="password"
						placeholder="Password"
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && email && password && !isLoading) {
								void submit();
							}
						}}
					/>
					<button
						type="button"
						className="btn btn-primary w-full"
						onClick={submit}
						disabled={isLoading || !email || !password}
					>
						{isLoading ? "Signing in…" : "Sign in"}
					</button>
					{error ? (
						<p className="text-sm text-[var(--danger)]">{error}</p>
					) : null}
					<p className="text-xs text-[var(--muted-2)]">
						<Link className="underline" to="/forgot-password">
							Forgot password?
						</Link>
					</p>
				</div>
			</div>
		</div>
	);
}
