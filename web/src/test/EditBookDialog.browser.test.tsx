import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { api } from "../../convex/_generated/api";
import { EditBookDialog } from "../components/EditBookDialog";
import { db } from "../lib/db";

const mocks = vi.hoisted(() => ({
	updateBookMetadata: vi.fn(),
	attachFiles: vi.fn(),
	fetchCandidates: vi.fn(),
	fetchPageHtml: vi.fn(),
	fetchCoverImage: vi.fn(),
}));

vi.mock("convex/react", async () => {
	const { getFunctionName: nameFn } = await import("convex/server");
	const { api: apiRef } = await import("../../convex/_generated/api");
	const nameOf = (ref: unknown) => nameFn(ref as never);
	return {
		useConvexAuth: () => ({ isAuthenticated: true }),
		useConvex: () => ({ mutation: vi.fn(), query: vi.fn() }),
		useMutation: (ref: unknown) => {
			const name = nameOf(ref);
			if (name === nameOf(apiRef.metadata.updateBookMetadata)) {
				return mocks.updateBookMetadata;
			}
			if (name === nameOf(apiRef.books.attachFiles)) {
				return mocks.attachFiles;
			}
			return vi.fn();
		},
		useAction: (ref: unknown) => {
			const name = nameOf(ref);
			if (name === nameOf(apiRef.metadata.fetchCandidates)) {
				return mocks.fetchCandidates;
			}
			if (name === nameOf(apiRef.metadata.fetchPageHtml)) {
				return mocks.fetchPageHtml;
			}
			if (name === nameOf(apiRef.metadata.fetchCoverImage)) {
				return mocks.fetchCoverImage;
			}
			return vi.fn();
		},
	};
});

const book = {
	_id: "book1",
	title: "martial world",
	author: "Unknown Uploader",
	series: null,
	seriesIndex: null,
	description: null,
	language: "en",
	sourceUrl: null,
};

// Sanity: the name-based mock matching must resolve these.
void getFunctionName(api.metadata.updateBookMetadata as never);

describe("EditBookDialog", () => {
	beforeEach(async () => {
		for (const mock of Object.values(mocks)) {
			mock.mockReset();
		}
		mocks.updateBookMetadata.mockResolvedValue(undefined);
		await db.books.clear();
	});

	it("prefills current values and saves only changed fields", async () => {
		const onClose = vi.fn();
		const screen = await render(
			<EditBookDialog book={book} onClose={onClose} />,
		);

		const titleInput = screen.getByLabelText("Title");
		await expect.element(titleInput).toHaveValue("martial world");

		await titleInput.fill("Martial World");
		await screen.getByRole("button", { name: "Save" }).click();

		await expect.poll(() => mocks.updateBookMetadata.mock.calls.length).toBe(1);
		expect(mocks.updateBookMetadata).toHaveBeenCalledWith({
			bookId: "book1",
			title: "Martial World",
		});
		expect(onClose).toHaveBeenCalled();
	});

	it("clears a field with an emptied input (null), and blocks empty titles", async () => {
		const screen = await render(
			<EditBookDialog book={book} onClose={vi.fn()} />,
		);

		await screen.getByLabelText("Author").fill("");
		await screen.getByRole("button", { name: "Save" }).click();
		await expect.poll(() => mocks.updateBookMetadata.mock.calls.length).toBe(1);
		expect(mocks.updateBookMetadata).toHaveBeenCalledWith({
			bookId: "book1",
			author: null,
		});

		mocks.updateBookMetadata.mockClear();
		await screen.getByLabelText("Title").fill("");
		const save = screen.getByRole("button", { name: "Save" });
		await expect.element(save).toBeDisabled();
	});

	it("applies fetched fields into the form via the diff preview, respecting unchecked rows", async () => {
		mocks.fetchCandidates.mockResolvedValue([
			{
				title: "Martial World",
				author: "Cocooned Cow",
				source: "openlibrary",
			},
		]);
		const screen = await render(
			<EditBookDialog book={book} onClose={vi.fn()} />,
		);

		await screen.getByRole("button", { name: "Fetch metadata" }).click();
		await screen.getByRole("button", { name: "Search online" }).click();
		// Candidate card appears; select it.
		await screen.getByRole("button", { name: /Cocooned Cow/ }).click();

		// Uncheck the Author row, keep Title checked.
		const authorRow = screen.getByRole("checkbox").nth(1);
		await authorRow.click();
		await screen.getByRole("button", { name: "Apply selected" }).click();

		await expect
			.element(screen.getByLabelText("Title"))
			.toHaveValue("Martial World");
		await expect
			.element(screen.getByLabelText("Author"))
			.toHaveValue("Unknown Uploader");
	});
});
