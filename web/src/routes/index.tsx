import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
	const navigate = useNavigate();
	const { isAuthenticated, isLoading } = useConvexAuth();
	const signupEnabled = useQuery(api.config.signupEnabled);

	useEffect(() => {
		if (!isLoading && isAuthenticated) {
			navigate({ to: "/library" });
		}
	}, [isAuthenticated, isLoading, navigate]);

	if (isLoading || isAuthenticated) {
		return (
			<div className="min-h-screen px-6 py-16">
				<div className="mx-auto w-full max-w-5xl text-sm text-[var(--muted)]">
					Preparing your library...
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-6 py-16">
			<div className="w-full max-w-lg text-center">
				<h1 className="text-5xl leading-tight">Your personal library.</h1>
				<p className="mx-auto mt-4 max-w-md text-base text-[var(--muted)]">
					Upload your EPUBs, read anywhere — even offline — and pick up
					mid-chapter on any device.
				</p>
				<div className="mt-8 flex flex-wrap justify-center gap-3">
					<Link className="btn btn-primary" to="/sign-in">
						Sign in
					</Link>
					{signupEnabled === false ? null : (
						<Link className="btn btn-ghost" to="/sign-up">
							Create account
						</Link>
					)}
				</div>
			</div>
		</div>
	);
}
