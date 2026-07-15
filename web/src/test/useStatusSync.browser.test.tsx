import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import { useStatusSync } from "../hooks/useStatusSync";
import { db } from "../lib/db";

// The push pass sends `baseServerTime` — the last server status version this
// device merged. The server only rejects a stale write when that base is a
// concrete number (`baseServerTime !== undefined`); an undefined base is
// accepted unconditionally. So a device that has never observed the server's
// status version must still push a concrete floor (0), or it silently clobbers
// a newer status set on another device.

const mocks = vi.hoisted(() => ({
	updateStatus: vi.fn(),
	// Swapped per test: the remote listByUser result the hook sees.
	remote: undefined as
		| undefined
		| { bookId: string; status: string | null; statusUpdatedAt: number }[],
}));

vi.mock("convex/react", async () => {
	const { getFunctionName } = await import("convex/server");
	const { api } = await import("../../convex/_generated/api");
	const nameOf = (ref: unknown) => getFunctionName(ref as never);
	return {
		useConvexAuth: () => ({ isAuthenticated: true }),
		useQuery: () => mocks.remote,
		useMutation: (ref: unknown) =>
			nameOf(ref) === nameOf(api.userBooks.updateStatus)
				? mocks.updateStatus
				: vi.fn(),
	};
});

beforeEach(async () => {
	await db.bookStatus.clear();
	mocks.updateStatus.mockReset();
	mocks.updateStatus.mockResolvedValue({ accepted: true, serverTime: 7 });
	mocks.remote = undefined;
});

describe("useStatusSync push base version", () => {
	it("pushes a concrete base (0) when neither a local row nor a remote version is known", async () => {
		// Offline / query not loaded: remote is undefined and there is no prior
		// local status row for this book — the both-unknown case.
		mocks.remote = undefined;

		const { result } = await renderHook(() =>
			useStatusSync({ canQuery: true }),
		);

		await result.current.setStatus("book_a", "want");

		await expect
			.poll(() => mocks.updateStatus.mock.calls.length)
			.toBeGreaterThan(0);
		// Must NOT be undefined — an undefined base bypasses the server's stale
		// guard and would overwrite a newer status from another device.
		expect(mocks.updateStatus).toHaveBeenCalledWith(
			expect.objectContaining({ bookId: "book_a", baseServerTime: 0 }),
		);
	});

	it("still seeds the base from the observed remote version (no regression)", async () => {
		// This device has observed the server's status version (100) via the
		// query, but has no local row yet. Its edit is current, so it must push
		// base=100 (not 0) or the server would wrongly reject a legitimate write.
		mocks.remote = [
			{ bookId: "book_b", status: "reading", statusUpdatedAt: 100 },
		];

		const { result } = await renderHook(() =>
			useStatusSync({ canQuery: true }),
		);

		await result.current.setStatus("book_b", "want");

		await expect
			.poll(() => mocks.updateStatus.mock.calls.length)
			.toBeGreaterThan(0);
		expect(mocks.updateStatus).toHaveBeenCalledWith(
			expect.objectContaining({ bookId: "book_b", baseServerTime: 100 }),
		);
	});
});
