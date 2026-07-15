import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import { useProgressSync } from "../hooks/useProgressSync";
import { activateUserDatabase, db, forgetActiveUserDatabase } from "../lib/db";

const mocks = vi.hoisted(() => ({
	updateProgress: vi.fn(),
}));

vi.mock("convex/react", () => ({
	useQuery: () => null,
	useMutation: () => mocks.updateProgress,
}));

beforeEach(async () => {
	await db.progress.clear();
	mocks.updateProgress.mockReset();
	Object.defineProperty(window.navigator, "onLine", {
		configurable: true,
		value: true,
	});
});

describe("useProgressSync in-flight edits", () => {
	it("does not dirty or push an identical position again", async () => {
		mocks.updateProgress.mockResolvedValue({
			accepted: true,
			serverTime: 10,
		});
		const { result } = await renderHook(() =>
			useProgressSync({ bookId: "book_idempotent", canQuery: true }),
		);
		const position = {
			sectionIndex: 3,
			blockIndex: 2,
			blockOffset: 0.5,
			sectionFraction: 0.4,
		};
		await result.current.saveProgress(position);
		await expect.poll(() => mocks.updateProgress.mock.calls.length).toBe(1);
		await expect
			.poll(async () => (await db.progress.get("book_idempotent"))?.dirty)
			.toBe(0);

		await result.current.saveProgress(position);
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(mocks.updateProgress).toHaveBeenCalledTimes(1);
		expect((await db.progress.get("book_idempotent"))?.dirty).toBe(0);
	});

	it("rebases and flushes a newer position saved during an accepted push", async () => {
		let resolveFirst: (value: {
			accepted: boolean;
			serverTime: number;
		}) => void = () => {};
		mocks.updateProgress
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveFirst = resolve;
					}),
			)
			.mockResolvedValueOnce({ accepted: true, serverTime: 102 });

		const { result } = await renderHook(() =>
			useProgressSync({ bookId: "book_a", canQuery: true }),
		);

		await result.current.saveProgress({
			sectionIndex: 1,
			blockIndex: 2,
			blockOffset: 0.25,
		});
		await expect.poll(() => mocks.updateProgress.mock.calls.length).toBe(1);

		// This edit lands while section 1 is still awaiting its response.
		await result.current.saveProgress({
			sectionIndex: 15,
			blockIndex: 7,
			blockOffset: 0.5,
		});
		resolveFirst({ accepted: true, serverTime: 101 });

		await expect.poll(() => mocks.updateProgress.mock.calls.length).toBe(2);
		expect(mocks.updateProgress.mock.calls[1]?.[0]).toEqual(
			expect.objectContaining({
				lastSectionIndex: 15,
				baseServerTime: 101,
			}),
		);
		await expect
			.poll(async () => (await db.progress.get("book_a"))?.dirty)
			.toBe(0);
		expect((await db.progress.get("book_a"))?.syncedServerTime).toBe(102);
	});

	it("rebases a newer position after the first in-flight write is rejected", async () => {
		let resolveFirst: (value: {
			accepted: boolean;
			serverTime: number;
		}) => void = () => {};
		mocks.updateProgress
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveFirst = resolve;
					}),
			)
			.mockResolvedValueOnce({ accepted: true, serverTime: 102 });

		const { result } = await renderHook(() =>
			useProgressSync({ bookId: "book_rejected", canQuery: true }),
		);
		await result.current.saveProgress({
			sectionIndex: 1,
			blockIndex: 0,
			blockOffset: 0,
		});
		await expect.poll(() => mocks.updateProgress.mock.calls.length).toBe(1);
		await result.current.saveProgress({
			sectionIndex: 15,
			blockIndex: 0,
			blockOffset: 0,
		});
		resolveFirst({ accepted: false, serverTime: 101 });

		await expect.poll(() => mocks.updateProgress.mock.calls.length).toBe(2);
		expect(mocks.updateProgress.mock.calls[1]?.[0]).toEqual(
			expect.objectContaining({
				lastSectionIndex: 15,
				baseServerTime: 101,
			}),
		);
		await expect
			.poll(async () => (await db.progress.get("book_rejected"))?.dirty)
			.toBe(0);
	});

	it("durably adopts the winning server position in the rejection acknowledgement", async () => {
		mocks.updateProgress.mockResolvedValueOnce({
			accepted: false,
			serverTime: 50,
			lastSectionIndex: 15,
			lastBlockIndex: 4,
			lastBlockOffset: 0.5,
			lastSectionFraction: 0.75,
		});
		const { result } = await renderHook(() =>
			useProgressSync({ bookId: "book_rejected_value", canQuery: true }),
		);
		await result.current.saveProgress({
			sectionIndex: 0,
			blockIndex: 0,
			blockOffset: 0,
		});

		await expect
			.poll(async () => (await db.progress.get("book_rejected_value"))?.dirty)
			.toBe(0);
		expect(await db.progress.get("book_rejected_value")).toEqual(
			expect.objectContaining({
				sectionIndex: 15,
				blockIndex: 4,
				blockOffset: 0.5,
				sectionFraction: 0.75,
				syncedServerTime: 50,
			}),
		);
	});

	it("retries a durable dirty position when the browser comes back online", async () => {
		Object.defineProperty(window.navigator, "onLine", {
			configurable: true,
			value: false,
		});
		mocks.updateProgress
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce({ accepted: true, serverTime: 5 });
		const { result } = await renderHook(() =>
			useProgressSync({ bookId: "book_retry", canQuery: true }),
		);
		await result.current.saveProgress({
			sectionIndex: 4,
			blockIndex: 1,
			blockOffset: 0,
		});
		await expect.poll(() => mocks.updateProgress.mock.calls.length).toBe(1);
		expect((await db.progress.get("book_retry"))?.dirty).toBe(1);

		Object.defineProperty(window.navigator, "onLine", {
			configurable: true,
			value: true,
		});
		window.dispatchEvent(new Event("online"));

		await expect.poll(() => mocks.updateProgress.mock.calls.length).toBe(2);
		await expect
			.poll(async () => (await db.progress.get("book_retry"))?.dirty)
			.toBe(0);
	});

	it("cannot acknowledge an old account's in-flight write in the next account", async () => {
		let resolveWrite: (value: {
			accepted: boolean;
			serverTime: number;
		}) => void = () => {};
		mocks.updateProgress.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveWrite = resolve;
				}),
		);

		activateUserDatabase("sync-account-a");
		const { result, unmount } = await renderHook(() =>
			useProgressSync({ bookId: "shared_book_id", canQuery: true }),
		);
		await result.current.saveProgress({
			sectionIndex: 15,
			blockIndex: 1,
			blockOffset: 0,
		});
		await expect.poll(() => mocks.updateProgress.mock.calls.length).toBe(1);

		// Account A's subtree unmounts before the database binding switches to B.
		// Its delayed response must retain A's captured handle, never the live
		// exported binding that now points at B.
		unmount();
		activateUserDatabase("sync-account-b");
		await db.progress.put({
			bookId: "shared_book_id",
			sectionIndex: 2,
			blockIndex: 0,
			blockOffset: 0,
			editedAt: 1,
			dirty: 1,
			syncedServerTime: 0,
		});

		resolveWrite({ accepted: true, serverTime: 99 });
		await new Promise((resolve) => setTimeout(resolve, 50));
		const accountBRow = await db.progress.get("shared_book_id");
		expect(accountBRow).toEqual(
			expect.objectContaining({
				sectionIndex: 2,
				dirty: 1,
				syncedServerTime: 0,
			}),
		);

		forgetActiveUserDatabase();
	});
});
