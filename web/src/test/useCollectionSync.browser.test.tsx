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
			if (name === nameOf(api.collections.addBookMembership)) {
				return mocks.addBookToCollection;
			}
			if (name === nameOf(api.collections.removeBookMembership)) {
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
	mocks.renameCollection.mockResolvedValue({
		accepted: true,
		serverTime: 2,
		name: "Remote",
	});
});

describe("useCollectionSync push ordering", () => {
	it("writes dirty local rows and pushes collection before membership", async () => {
		mocks.createCollection.mockResolvedValue({ id: "col_1", serverTime: 1 });
		mocks.addBookToCollection.mockResolvedValue({
			id: "mem_1",
			accepted: true,
			serverTime: 2,
			deleted: false,
		});

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
		mocks.addBookToCollection.mockResolvedValue({
			id: "mem_1",
			accepted: true,
			serverTime: 2,
			deleted: false,
		});

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
		mocks.createCollection.mockResolvedValue({ id: "col_2", serverTime: 1 });
		await result.current.renameCollection(key, "Science fiction");
		await expect
			.poll(async () => (await db.collectionBooks.toArray())[0]?.convexId)
			.toBe("mem_1");
		expect(mocks.addBookToCollection).toHaveBeenCalledWith(
			expect.objectContaining({ collectionId: "col_2", bookId: "book_b" }),
		);
	});

	it("does not lose a remove that lands during the add's round-trip", async () => {
		mocks.createCollection.mockResolvedValue({ id: "col_r", serverTime: 1 });
		// Hold addRemote open so a remove can land mid-round-trip.
		let resolveAdd: (value: {
			id: string;
			accepted: boolean;
			serverTime: number;
			deleted: boolean;
		}) => void = () => {};
		mocks.addBookToCollection.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveAdd = resolve;
				}),
		);
		mocks.removeBookFromCollection.mockResolvedValue({
			accepted: true,
			serverTime: 3,
			deleted: true,
		});

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
		resolveAdd({
			id: "mem_x",
			accepted: true,
			serverTime: 2,
			deleted: false,
		});

		// The membership must end up removed on the server and retained only as
		// a clean local tombstone, carrying the version needed for a safe re-add.
		await expect
			.poll(() => mocks.removeBookFromCollection.mock.calls.length)
			.toBe(1);
		await expect
			.poll(async () => (await db.collectionBooks.toArray())[0]?.dirty)
			.toBe(0);
		expect((await db.collectionBooks.toArray())[0]?.deletedAt).toBeDefined();
	});

	it("purges local rows when the server reports the collection tombstoned", async () => {
		mocks.createCollection.mockResolvedValue({ id: "col_3", serverTime: 1 });
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

	it("rebases a newer rename that lands during an accepted rename", async () => {
		await db.collections.put({
			clientKey: "local_col",
			name: "Original",
			createdAt: 1,
			nameEditedAt: 1,
			syncedServerTime: 10,
			dirty: 0,
			convexId: "col_server",
		});
		let resolveFirst: (value: {
			accepted: boolean;
			serverTime: number;
		}) => void = () => {};
		mocks.renameCollection
			.mockReset()
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveFirst = resolve;
					}),
			)
			.mockResolvedValueOnce({ accepted: true, serverTime: 12 });

		const { result } = await renderHook(() =>
			useCollectionSync({ canQuery: true }),
		);
		await result.current.renameCollection("local_col", "First");
		await expect.poll(() => mocks.renameCollection.mock.calls.length).toBe(1);
		await result.current.renameCollection("local_col", "Second");
		resolveFirst({ accepted: true, serverTime: 11 });

		await expect.poll(() => mocks.renameCollection.mock.calls.length).toBe(2);
		expect(mocks.renameCollection.mock.calls[1]?.[0]).toEqual(
			expect.objectContaining({ name: "Second", baseServerTime: 11 }),
		);
	});

	it("durably adopts the winning collection name after rejection", async () => {
		await db.collections.put({
			clientKey: "rejected_col",
			name: "Old",
			createdAt: 1,
			nameEditedAt: 1,
			syncedServerTime: 10,
			dirty: 0,
			convexId: "col_server",
		});
		mocks.renameCollection.mockResolvedValueOnce({
			accepted: false,
			serverTime: 20,
			name: "Other device",
		});
		const { result } = await renderHook(() =>
			useCollectionSync({ canQuery: true }),
		);
		await result.current.renameCollection("rejected_col", "Stale local");

		await expect
			.poll(async () => (await db.collections.get("rejected_col"))?.dirty)
			.toBe(0);
		expect(await db.collections.get("rejected_col")).toEqual(
			expect.objectContaining({
				name: "Other device",
				syncedServerTime: 20,
			}),
		);
	});
});
