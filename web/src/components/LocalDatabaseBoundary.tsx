import { useEffect, useState } from "react";
import { authClient } from "../lib/auth-client";

const storedUserId = () =>
	typeof localStorage === "undefined"
		? null
		: localStorage.getItem("librium:activeLocalUser");

export function LocalDatabaseBoundary({
	children,
}: {
	children: React.ReactNode;
}) {
	const { data: session, isPending } = authClient.useSession();
	const userId = session?.user.id ?? null;
	const [mountedUserId, setMountedUserId] = useState(storedUserId);
	const [isOnline, setIsOnline] = useState(() =>
		typeof navigator === "undefined" ? true : navigator.onLine,
	);

	useEffect(() => {
		const handleOnline = () => setIsOnline(true);
		const handleOffline = () => setIsOnline(false);
		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);
		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, []);

	useEffect(() => {
		// Wait for the session to resolve before acting: on a reload the session
		// is briefly pending with no user, which must NOT be mistaken for a
		// sign-out (that would tear down the signed-in user's database every load).
		if (isPending) {
			return;
		}
		// A production-PWA cold start has no live auth response while offline.
		// Keep the last confirmed account database active; RequireAuth applies the
		// same previously-authenticated rule before it renders protected routes.
		// A confirmed online sign-out still tears the database down below.
		if (!isOnline && !userId && mountedUserId) {
			return;
		}
		// Already bound to the right database (covers both signed-in and the
		// null === null signed-out case) — nothing to switch.
		if (mountedUserId === userId) {
			return;
		}
		let cancelled = false;
		void import("../lib/db").then(
			({ activateUserDatabase, forgetActiveUserDatabase }) => {
				if (cancelled) return;
				// The boundary owns the whole lifecycle so teardown fires on EVERY
				// sign-out path (button, session expiry, revocation), and signing
				// back into the same account re-activates its database.
				if (userId) {
					activateUserDatabase(userId);
				} else {
					forgetActiveUserDatabase();
				}
				setMountedUserId(userId);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [userId, mountedUserId, isPending, isOnline]);

	// Never render an authenticated user's routes against the previous user's
	// live Dexie binding. The effect switches synchronously, then this keyed
	// subtree remounts every liveQuery on the correct database.
	if (userId && mountedUserId !== userId) {
		return (
			<div className="min-h-screen px-6 py-10 text-sm text-[var(--muted)]">
				Opening your local library…
			</div>
		);
	}

	return <div key={mountedUserId ?? "signed-out"}>{children}</div>;
}
