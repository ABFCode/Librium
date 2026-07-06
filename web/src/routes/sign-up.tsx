import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/sign-up")({
	component: SignUp,
});

function SignUp() {
	const navigate = useNavigate();
	// undefined while loading; false when registration is closed on this instance.
	const signupEnabled = useQuery(api.config.signupEnabled);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const submit = async () => {
		setError(null);
		setIsLoading(true);
		try {
			const result = await authClient.signUp.email({
				name,
				email,
				password,
				fetchOptions: { throw: false },
			});
			if (result?.error) {
				// Server rejects signup with this code when registration is closed.
				const message =
					result.error.code === "EMAIL_PASSWORD_SIGN_UP_DISABLED"
						? "Registration is currently closed."
						: result.error.message || "Unable to sign up";
				setError(message);
				return;
			}
			navigate({ to: "/library" });
		} catch (err) {
			const message =
				err && typeof err === "object" && "data" in err
					? JSON.stringify(err.data)
					: err instanceof Error
						? err.message
						: "Unable to sign up";
			setError(message);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-6 py-12">
			<div className="surface w-full max-w-sm p-8">
				{signupEnabled === false ? (
					<>
						<h1 className="text-2xl">Registration is closed</h1>
						<p className="mt-2 text-sm text-[var(--muted)]">
							Librium isn't open for new accounts right now. If you already have
							an account, you can sign in.
						</p>
						<Link className="btn btn-primary mt-6 w-full" to="/sign-in">
							Go to sign in
						</Link>
					</>
				) : (
					<>
						<h1 className="text-2xl">Create an account</h1>
						<p className="mt-1 text-sm text-[var(--muted-2)]">
							Sign up with email and password.
						</p>
						<div className="mt-6 space-y-3">
							<input
								className="input"
								type="text"
								placeholder="Name"
								value={name}
								onChange={(event) => setName(event.target.value)}
							/>
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
							/>
							<button
								type="button"
								className="btn btn-primary w-full"
								onClick={submit}
								disabled={isLoading || !name || !email || !password}
							>
								{isLoading ? "Creating account…" : "Create account"}
							</button>
							{error ? (
								<p className="text-sm text-[var(--danger)]">{error}</p>
							) : null}
						</div>
					</>
				)}
			</div>
		</div>
	);
}
