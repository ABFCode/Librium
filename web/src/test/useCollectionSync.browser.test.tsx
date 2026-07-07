import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import { useCollectionSync } from "../hooks/useCollectionSync";
import { db } from "../lib/db";

// The mutation mocks are swapped per test; useQuery stays `undefined`
// (loading) so the merge pass never runs — these tests exercise the local
// write + push ordering in isolation, against real IndexedDB.
const mocks = vi.hoisted(() => ({
	createCollection: vi.fn(),
	renameCollection: vi.fn(),
	deleteCollection: vi.fn(),
	addBookToCollection: vi.fn(),
	removeBookFromCollection: vi.fn(),
}));

vi.mock("convex/react", async () => {
	const { getFunctionName } = await import("convex/server");
	const { api } = await import("../../convex/_generated/api");
	const nameOf = (ref: unknown) => getFunctionName(ref as never);
	return {
		useConvexAuth: () => ({ isAuthenticated: true }),
		useQuery: () => undefined,
		useMutation: (ref: unknown) => {
			const name = nameOf(ref);
			if (name === nameOf(api.collections.createCollection)) {
				return mocks.createCollection;
			}
			if (name === nameOf(api.collections.renameCollection)) {
				return mocks.renameCollection;
			}
			if (name === nameOf(api.collections.deleteCollection)) {
				return mocks.deleteCollection;
			}
			if (name === nameOf(api.collections.addBookToCollection)) {
				return mocks.addBookToCollection;
			}
			if (name === nameOf(api.collections.removeBookFromCollection)) {
				return mocks.removeBookFromCollection;
			}
			return vi.fn();
		},
	};
});

beforeEach(async () => {
	await db.collections.clear();
	await db.collectionBooks.clear();
	for (const mock of Object.values(mocks)) {
		mock.mockReset();
	}
});

describe("useCollectionSync push ordering", () => {
	it("writes dirty local rows and pushes collection before membership", async () => {
		mocks.createCollection.mockResolvedValue("col_1");
		mocks.addBookToCollection.mockResolvedValue("mem_1");

		const { result } = await renderHook(() =>
			useCollectionSync({ canQuery: true }),
		);

		const key = await result.current.createCollection("Fantasy");
		await result.current.addBooks(key, ["book_a"]);

		// Both rows land dirty in IndexedDB immediately (offline-capable write).
		const membership = await db.collectionBooks
			.where("collectionKey")
			.equals(key)
			.first();
		expect(membership?.dirty).toBe(1);

		// Push settles both — the membership resolves the collection's convexId
		// recorded in the same pass (freshConvexIds), never before it.
		await expect
			.poll(async () => (await db.collectionBooks.toArray())[0]?.convexId)
			.toBe("mem_1");
		expect(mocks.createCollection).toHaveBeenCalledTimes(1);
		expect(mocks.addBookToCollection).toHaveBeenCalledWith(
			expect.objectContaining({ collectionId: "col_1", bookId: "book_a" }),
		);
		expect(mocks.createCollection.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.addBookToCollection.mock.invocationCallOrder[0],
		);
		const collection = await db.collections.get(key);
		expect(collection?.convexId).toBe("col_1");
		expect(collection?.dirty).toBe(0);
	});

	it("defers membership pushes while the collection create is unacknowledged", async () => {
		mocks.createCollection.mockRejectedValue(new Error("offline"));
		mocks.addBookToCollection.mockResolvedValue("mem_1");

		const { result } = await renderHook(() =>
			useCollectionSync({ canQuery: true }),
		);

		const key = await result.current.createCollection("Sci-fi");
		await result.current.addBooks(key, ["book_b"]);

		// The collection create fails; the membership must not push against a
		// missing convexId.
		await expect
			.poll(() => mocks.createCollection.mock.calls.length)
			.toBeGreaterThan(0);
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(mocks.addBookToCollection).not.toHaveBeenCalled();

		// Server reachable again: the next pass creates the collection and the
		// membership follows in the same pass.
		mocks.createCollection.mockResolvedValue("col_2");
		await result.current.renameCollection(key, "Science fiction");
		await expect
			.poll(async () => (await db.collectionBooks.toArray())[0]?.convexId)
			.toBe("mem_1");
		expect(mocks.addBookToCollection).toHaveBeenCalledWith(
			expect.objectContaining({ collectionId: "col_2", bookId: "book_b" }),
		);
	});

	it("does not lose a remove that lands during the add's round-trip", async () => {
		mocks.createCollection.mockResolvedValue("col_r");
		// Hold addRemote open so a remove can land mid-round-trip.
		let resolveAdd: (id: string) => void = () => {};
		mocks.addBookToCollection.mockImplementation(
			() =>
				new Promise<string>((resolve) => {
					resolveAdd = resolve;
				}),
		);
		mocks.removeBookFromCollection.mockResolvedValue(undefined);

		const { result } = await renderHook(() =>
			useCollectionSync({ canQuery: true }),
		);

		const key = await result.current.createCollection("Fleeting");
		await result.current.addBooks(key, ["book_x"]);

		// Wait until the add push is in flight.
		await expect
			.poll(() => mocks.addBookToCollection.mock.calls.length)
			.toBe(1);

		// User un-checks the book before the add resolves → tombstone.
		await result.current.removeBooks(key, ["book_x"]);
		// Now let the add resolve; its post-write must not clear the tombstone.
		resolveAdd("mem_x");

		// The membership must end up removed on the server and gone locally —
		// not stranded as a live server row (dirty:0, deletedAt set).
		await expect
			.poll(() => mocks.removeBookFromCollection.mock.calls.length)
			.toBe(1);
		await expect.poll(async () => await db.collectionBooks.count()).toBe(0);
	});

	it("purges local rows when the server reports the collection tombstoned", async () => {
		mocks.createCollection.mockResolvedValue("col_3");
		// Collection deleted on another device while this add was queued.
		mocks.addBookToCollection.mockResolvedValue(null);

		const { result } = await renderHook(() =>
			useCollectionSync({ canQuery: true }),
		);

		const key = await result.current.createCollection("Doomed");
		await result.current.addBooks(key, ["book_c"]);

		await expect
			.poll(() => mocks.addBookToCollection.mock.calls.length)
			.toBeGreaterThan(0);
		await expect.poll(async () => await db.collectionBooks.count()).toBe(0);
	});
});
