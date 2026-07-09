import { useNavigate } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { useEffect, useState } from "react";

// Remembers that this device was signed in, so local-first content can render
// while offline (Convex cannot confirm auth without a connection). Cleared on
// a confirmed online sign-out.
const WAS_AUTHENTICATED_KEY = "librium:wasAuthenticated";

// How long to wait for auth to resolve before falling back to local content.
// navigator.onLine is not a reliable offline signal (it stays true whenever a
// network interface is up — including against localhost), so the trigger is
// "auth still unresolved after the grace window", which is what offline
// actually looks like: the Convex websocket retrying forever.
const AUTH_GRACE_MS = 2500;

type RequireAuthProps = {
	children: React.ReactNode;
};

export const RequireAuth = ({ children }: RequireAuthProps) => {
	const navigate = useNavigate();
	const { isAuthenticated, isLoading } = useConvexAuth();
	const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
	const wasAuthenticated =
		typeof window !== "undefined" &&
		window.localStorage.getItem(WAS_AUTHENTICATED_KEY) === "true";

	const [authWaitExpired, setAuthWaitExpired] = useState(false);
	useEffect(() => {
		if (!isLoading) {
			setAuthWaitExpired(false);
			return;
		}
		const timeout = window.setTimeout(
			() => setAuthWaitExpired(true),
			AUTH_GRACE_MS,
		);
		return () => window.clearTimeout(timeout);
	}, [isLoading]);

	useEffect(() => {
		if (isAuthenticated) {
			window.localStorage.setItem(WAS_AUTHENTICATED_KEY, "true");
		}
	}, [isAuthenticated]);

	useEffect(() => {
		if (!isLoading && !isAuthenticated && !isOffline) {
			window.localStorage.removeItem(WAS_AUTHENTICATED_KEY);
			navigate({ to: "/sign-in" });
		}
	}, [isAuthenticated, isLoading, navigate, isOffline]);

	// Offline grace: if this device was previously signed in and auth cannot be
	// confirmed (browser says offline, or the server is unreachable and auth is
	// stuck resolving), render — content comes from IndexedDB and every
	// Convex-dependent feature degrades gracefully. If auth later resolves to a
	// real signed-out state while online, the effect above redirects.
	if (
		!isAuthenticated &&
		wasAuthenticated &&
		(isOffline || (isLoading && authWaitExpired))
	) {
		return <>{children}</>;
	}

	if (isLoading) {
		return (
			<div className="min-h-screen px-6 py-10">
				<div className="mx-auto w-full max-w-5xl">
					<div className="surface-soft animate-pulse rounded-2xl p-6">
						<div className="h-3 w-32 rounded-full bg-white/10" />
						<div className="mt-3 h-3 w-48 rounded-full bg-white/5" />
					</div>
				</div>
			</div>
		);
	}

	if (!isAuthenticated) {
		return null;
	}

	return <>{children}</>;
};
