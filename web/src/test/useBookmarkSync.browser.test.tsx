import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import { useBookmarkSync } from "../hooks/useBookmarkSync";
import { db } from "../lib/db";

const mocks = vi.hoisted(() => ({
	createBookmark: vi.fn(),
	deleteBookmark: vi.fn(),
}));

vi.mock("convex/react", async () => {
	const { getFunctionName } = await import("convex/server");
	const { api } = await import("../../convex/_generated/api");
	const nameOf = (ref: unknown) => getFunctionName(ref as never);
	return {
		useQuery: () => undefined,
		useMutation: (ref: unknown) =>
			nameOf(ref) === nameOf(api.bookmarks.createBookmark)
				? mocks.createBookmark
				: mocks.deleteBookmark,
	};
});

beforeEach(async () => {
	await db.bookmarks.clear();
	mocks.createBookmark.mockReset();
	mocks.deleteBookmark.mockReset();
	mocks.deleteBookmark.mockResolvedValue(undefined);
});

describe("useBookmarkSync in-flight operations", () => {
	it("pushes a delete that lands while its create request is in flight", async () => {
		let resolveCreate: (id: string) => void = () => {};
		mocks.createBookmark.mockImplementation(
			() =>
				new Promise<string>((resolve) => {
					resolveCreate = resolve;
				}),
		);
		const { result } = await renderHook(() =>
			useBookmarkSync({ bookId: "book_a", canQuery: true }),
		);

		const clientKey = await result.current.createBookmark({
			sectionIndex: 1,
			blockIndex: 2,
			offset: 0.25,
		});
		expect(clientKey).toEqual(expect.any(String));
		await expect.poll(() => mocks.createBookmark.mock.calls.length).toBe(1);
		const local = await db.bookmarks.toCollection().first();
		expect(local).toBeDefined();
		expect(
			await result.current.deleteBookmark(local?.clientKey ?? "missing"),
		).toBe(true);
		resolveCreate("bookmark_1");

		await expect.poll(() => mocks.deleteBookmark.mock.calls.length).toBe(1);
		expect(mocks.deleteBookmark).toHaveBeenCalledWith({
			bookmarkId: "bookmark_1",
		});
		await expect.poll(async () => await db.bookmarks.count()).toBe(0);
	});
});
