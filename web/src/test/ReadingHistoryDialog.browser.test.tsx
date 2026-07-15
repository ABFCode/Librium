import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { ReadingHistoryDialog } from "../components/ReadingHistoryDialog";
import { db } from "../lib/db";

const mocks = vi.hoisted(() => ({
	recovery: undefined as
		| undefined
		| {
				current: null | {
					sectionIndex: number;
					blockIndex: number;
					blockOffset: number;
					sectionFraction: number;
					serverTime: number;
					deviceKind?: "phone" | "tablet" | "computer" | "unknown";
				};
				history: Array<{
					_id: string;
					sectionIndex: number;
					blockIndex: number;
					blockOffset: number;
					sectionFraction: number;
					recordedAt: number;
					deviceKind?: "phone" | "tablet" | "computer" | "unknown";
					cause: "reading" | "restore";
					largeBackwardJump?: boolean;
				}>;
		  },
	restore: vi.fn(),
}));

vi.mock("convex/react", () => ({
	useQuery: () => mocks.recovery,
	useMutation: () => mocks.restore,
}));

const current = {
	sectionIndex: 15,
	blockIndex: 4,
	blockOffset: 0.5,
	sectionFraction: 0.6,
	serverTime: 200,
	deviceKind: "phone" as const,
};

const checkpoint = {
	_id: "history-1",
	sectionIndex: 0,
	blockIndex: 2,
	blockOffset: 0.25,
	sectionFraction: 0.4,
	recordedAt: new Date("2026-07-15T12:00:00Z").getTime(),
	deviceKind: "computer" as const,
	cause: "reading" as const,
	largeBackwardJump: true,
};

describe("ReadingHistoryDialog", () => {
	beforeEach(async () => {
		mocks.restore.mockReset();
		mocks.recovery = { current, history: [checkpoint] };
		Object.defineProperty(window.navigator, "onLine", {
			configurable: true,
			value: true,
		});
		await Promise.all([db.sections.clear(), db.progress.clear()]);
		await db.sections.bulkPut([
			{
				bookId: "book-history",
				orderIndex: 0,
				title: "Chapter I. The Beginning",
				depth: 0,
			},
			{
				bookId: "book-history",
				orderIndex: 15,
				title: "Chapter XVI. The Turning Point",
				depth: 0,
			},
		]);
	});

	it("explains the current and recoverable positions in human terms", async () => {
		const screen = await render(
			<ReadingHistoryDialog
				bookId="book-history"
				bookTitle="Recovery Book"
				canQuery
				onClose={() => {}}
			/>,
		);

		await expect.element(screen.getByText("Recovery Book")).toBeVisible();
		await expect
			.element(screen.getByText("Chapter XVI. The Turning Point"))
			.toBeVisible();
		await expect
			.element(screen.getByText("Chapter I. The Beginning"))
			.toBeVisible();
		await expect
			.element(screen.getByText(/Protected before a large backward jump/))
			.toBeVisible();
		await expect.element(screen.getByText(/Chapter 16 · 60%/)).toBeVisible();
		await expect.element(screen.getByText(/Chapter 1 · 40%/)).toBeVisible();
	});

	it("restores through the current server version and updates the durable local position", async () => {
		mocks.restore.mockResolvedValue({
			accepted: true,
			changed: true,
			serverTime: 201,
			lastSectionIndex: 0,
			lastBlockIndex: 2,
			lastBlockOffset: 0.25,
			lastSectionFraction: 0.4,
		});
		const screen = await render(
			<ReadingHistoryDialog
				bookId="book-history"
				bookTitle="Recovery Book"
				canQuery
				onClose={() => {}}
			/>,
		);
		await screen.getByRole("button", { name: "Restore" }).click();

		await expect.poll(() => mocks.restore.mock.calls.length).toBe(1);
		expect(mocks.restore.mock.calls[0]?.[0]).toEqual(
			expect.objectContaining({
				bookId: "book-history",
				historyId: "history-1",
				baseServerTime: 200,
			}),
		);
		await expect
			.element(screen.getByText(/Chapter I\. The Beginning restored/))
			.toBeVisible();
		expect(await db.progress.get("book-history")).toEqual(
			expect.objectContaining({
				sectionIndex: 0,
				blockIndex: 2,
				blockOffset: 0.25,
				sectionFraction: 0.4,
				dirty: 0,
				syncedServerTime: 201,
			}),
		);
	});

	it("does not overwrite local state when a concurrent device makes the restore stale", async () => {
		await db.progress.put({
			bookId: "book-history",
			sectionIndex: 18,
			blockIndex: 0,
			blockOffset: 0,
			editedAt: 250,
			dirty: 0,
			syncedServerTime: 250,
		});
		mocks.restore.mockResolvedValue({
			accepted: false,
			changed: false,
			serverTime: 250,
			lastSectionIndex: 18,
		});
		const screen = await render(
			<ReadingHistoryDialog
				bookId="book-history"
				bookTitle="Recovery Book"
				canQuery
				onClose={() => {}}
			/>,
		);
		await screen.getByRole("button", { name: "Restore" }).click();
		await expect
			.element(screen.getByText(/changed on another device/))
			.toBeVisible();
		expect((await db.progress.get("book-history"))?.sectionIndex).toBe(18);
	});

	it("keeps history visible but blocks restoring while offline", async () => {
		Object.defineProperty(window.navigator, "onLine", {
			configurable: true,
			value: false,
		});
		const screen = await render(
			<ReadingHistoryDialog
				bookId="book-history"
				bookTitle="Recovery Book"
				canQuery
				onClose={() => {}}
			/>,
		);

		await expect.element(screen.getByText(/You’re offline/)).toBeVisible();
		await expect
			.element(screen.getByRole("button", { name: "Restore" }))
			.toBeDisabled();
	});

	it("has an honest empty state before the first synchronized position", async () => {
		mocks.recovery = { current: null, history: [] };
		const screen = await render(
			<ReadingHistoryDialog
				bookId="book-history"
				bookTitle="Recovery Book"
				canQuery
				onClose={() => {}}
			/>,
		);
		await expect
			.element(screen.getByText(/No synchronized reading position exists yet/))
			.toBeVisible();
	});

	it("hides duplicate current checkpoints and describes restore protection accurately", async () => {
		mocks.recovery = {
			current,
			history: [
				{
					...checkpoint,
					_id: "restore-protection",
					cause: "restore",
				},
				{
					...checkpoint,
					_id: "duplicate-current",
					sectionIndex: current.sectionIndex,
					blockIndex: current.blockIndex,
					blockOffset: current.blockOffset,
					sectionFraction: current.sectionFraction,
				},
			],
		};
		const screen = await render(
			<ReadingHistoryDialog
				bookId="book-history"
				bookTitle="Recovery Book"
				canQuery
				onClose={() => {}}
			/>,
		);

		await expect
			.element(screen.getByText(/Saved before a restore/))
			.toBeVisible();
		await expect
			.element(screen.getByText(/Protected before a large backward jump/))
			.not.toBeInTheDocument();
		await expect
			.element(screen.getByRole("button", { name: "Current" }))
			.not.toBeInTheDocument();
		await expect
			.element(screen.getByRole("button", { name: "Restore" }))
			.toBeVisible();
	});
});
