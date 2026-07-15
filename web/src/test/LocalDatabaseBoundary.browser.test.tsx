import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { LocalDatabaseBoundary } from "../components/LocalDatabaseBoundary";
import { db, forgetActiveUserDatabase } from "../lib/db";

// The boundary owns the per-account IndexedDB lifecycle: it must activate a
// user's database on sign-in AND tear it down on sign-out — for EVERY sign-out
// path (button, session expiry, revocation), not just the Header button. It
// must also re-open the same account's database if that account signs back in
// without a full page reload.

// A tiny external store standing in for authClient's session, so the test can
// drive loading / sign-in / sign-out transitions and the mocked useSession
// re-renders. `isPending` mirrors better-auth's initial-load flag.
type SessionState = {
	data: { user: { id: string } } | null;
	isPending: boolean;
};
const store = vi.hoisted(() => {
	let value: SessionState = { data: null, isPending: false };
	const listeners = new Set<() => void>();
	return {
		get: () => value,
		set(next: SessionState) {
			value = next;
			for (const l of listeners) l();
		},
		subscribe(l: () => void) {
			listeners.add(l);
			return () => listeners.delete(l);
		},
	};
});

const signedIn = (id: string): SessionState => ({
	data: { user: { id } },
	isPending: false,
});
const signedOut: SessionState = { data: null, isPending: false };
const loading: SessionState = { data: null, isPending: true };

vi.mock("../lib/auth-client", async () => {
	const React = await import("react");
	return {
		authClient: {
			useSession: () => React.useSyncExternalStore(store.subscribe, store.get),
		},
	};
});

const USER = "user-a";
const dbFor = (id: string) => `librium:user:${id}`;

beforeEach(() => {
	store.set(signedOut);
	Object.defineProperty(window.navigator, "onLine", {
		configurable: true,
		value: true,
	});
	localStorage.removeItem("librium:activeLocalUser");
	forgetActiveUserDatabase(); // known signed-out baseline
});

describe("LocalDatabaseBoundary account lifecycle", () => {
	it("activates the account database on sign-in", async () => {
		await render(
			<LocalDatabaseBoundary>
				<div>library</div>
			</LocalDatabaseBoundary>,
		);
		store.set(signedIn(USER));
		await expect.poll(() => db.name).toBe(dbFor(USER));
		expect(localStorage.getItem("librium:activeLocalUser")).toBe(USER);
	});

	it("tears the database down when the session ends (any sign-out path)", async () => {
		await render(
			<LocalDatabaseBoundary>
				<div>library</div>
			</LocalDatabaseBoundary>,
		);
		store.set(signedIn(USER));
		await expect.poll(() => db.name).toBe(dbFor(USER));

		// Session ends without the Header button — e.g. expiry / revocation.
		store.set(signedOut);
		await expect.poll(() => db.name).toBe("librium:signed-out");
		expect(localStorage.getItem("librium:activeLocalUser")).toBe(null);
	});

	it("re-opens the same account after signing out and back in (no reload)", async () => {
		await render(
			<LocalDatabaseBoundary>
				<div>library</div>
			</LocalDatabaseBoundary>,
		);
		store.set(signedIn(USER));
		await expect.poll(() => db.name).toBe(dbFor(USER));

		store.set(signedOut);
		await expect.poll(() => db.name).toBe("librium:signed-out");

		// Sign back in as the SAME user via client-side nav — must re-activate.
		store.set(signedIn(USER));
		await expect.poll(() => db.name).toBe(dbFor(USER));
	});

	it("does NOT tear down while the session is still loading (reload window)", async () => {
		// Simulate a reload for an already-signed-in user: the account database is
		// live, localStorage marks the active user, but useSession is briefly
		// pending with no user. That must not be read as a sign-out.
		const { activateUserDatabase } = await import("../lib/db");
		activateUserDatabase(USER);
		expect(db.name).toBe(dbFor(USER));

		store.set(loading);
		await render(
			<LocalDatabaseBoundary>
				<div>library</div>
			</LocalDatabaseBoundary>,
		);
		// Give the effect a chance to (wrongly) run.
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(db.name).toBe(dbFor(USER));

		// Once the session resolves to the same user, it simply stays put.
		store.set(signedIn(USER));
		await expect.poll(() => db.name).toBe(dbFor(USER));
	});

	it("keeps the last confirmed account database during an offline cold start", async () => {
		const { activateUserDatabase } = await import("../lib/db");
		activateUserDatabase(USER);
		store.set(signedOut);
		Object.defineProperty(window.navigator, "onLine", {
			configurable: true,
			value: false,
		});

		await render(
			<LocalDatabaseBoundary>
				<div>offline library</div>
			</LocalDatabaseBoundary>,
		);
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(db.name).toBe(dbFor(USER));
		expect(localStorage.getItem("librium:activeLocalUser")).toBe(USER);

		// Once connectivity returns, a still-signed-out session is authoritative.
		Object.defineProperty(window.navigator, "onLine", {
			configurable: true,
			value: true,
		});
		window.dispatchEvent(new Event("online"));
		await expect.poll(() => db.name).toBe("librium:signed-out");
	});
});
