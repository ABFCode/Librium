import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { api } from "../../convex/_generated/api";
import { EditBookDialog } from "../components/EditBookDialog";
import { db } from "../lib/db";

const mocks = vi.hoisted(() => ({
	updateBookMetadata: vi.fn(),
	fetchCandidates: vi.fn(),
	fetchPageHtml: vi.fn(),
	fetchCoverImage: vi.fn(),
	uploadBookAsset: vi.fn(),
}));

vi.mock("../lib/uploadBookAsset", () => ({
	uploadBookAsset: mocks.uploadBookAsset,
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
		await expect.poll(() => onClose.mock.calls.length).toBe(1);
	});

	it("clears a blank field as null and blocks blank titles", async () => {
		const screen = await render(
			<EditBookDialog book={book} onClose={vi.fn()} />,
		);

		const author = screen.getByLabelText("Author");
		await author.fill(" ");
		await expect.element(author).toHaveValue(" ");
		const save = screen.getByRole("button", { name: "Save" });
		await expect.element(save).toBeEnabled();
		await save.click();
		await expect.poll(() => mocks.updateBookMetadata.mock.calls.length).toBe(1);
		expect(mocks.updateBookMetadata).toHaveBeenCalledWith({
			bookId: "book1",
			author: null,
		});

		mocks.updateBookMetadata.mockClear();
		await screen.getByLabelText("Title").fill(" ");
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

	it("adopts a pasted image as the pending cover and uploads it on save", async () => {
		// uploadBookAsset finalizes server-side now (verified size + attach)
		// and returns the cover stamp.
		mocks.uploadBookAsset.mockResolvedValue({
			key: "books/book1/cover",
			coverStamp: 42,
		});
		const onClose = vi.fn();
		const screen = await render(
			<EditBookDialog book={book} onClose={onClose} />,
		);

		const file = new File([new Uint8Array([137, 80, 78, 71])], "cover.png", {
			type: "image/png",
		});
		const data = new DataTransfer();
		data.items.add(file);
		window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data }));

		await screen.getByRole("button", { name: "Save" }).click();

		await expect.poll(() => mocks.uploadBookAsset.mock.calls.length).toBe(1);
		expect(mocks.uploadBookAsset).toHaveBeenCalledWith(
			expect.anything(),
			"book1",
			"cover",
			expect.any(Blob),
		);
		await expect.poll(() => onClose.mock.calls.length).toBe(1);
		// Only the cover changed — no metadata patch.
		expect(mocks.updateBookMetadata).not.toHaveBeenCalled();
	});

	it("fills candidate, source URL, and cover from an extension clipboard payload", async () => {
		const screen = await render(
			<EditBookDialog book={book} onClose={vi.fn()} />,
		);

		const payload = {
			librium: 1,
			sourceUrl: "https://www.novelupdates.com/series/martial-world/",
			html: `<html><head>
				<meta property="og:title" content="Martial World - Novel Updates" />
				<meta property="og:image" content="https://cdn.novelupdates.com/images/mw.jpg" />
			</head><body><div id="showauthors"><a href="#">Cocooned Cow</a></div></body></html>`,
			coverDataUrl: "data:image/png;base64,iVBORw0KGgo=",
		};
		const data = new DataTransfer();
		data.setData("text/plain", JSON.stringify(payload));
		window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data }));

		// Source URL adopted, candidate offered in the (auto-opened) fetch panel,
		// pasted cover pending in the preview frame.
		await expect
			.element(screen.getByLabelText("Source page URL"))
			.toHaveValue("https://www.novelupdates.com/series/martial-world/");
		await expect
			.element(screen.getByRole("button", { name: /Cocooned Cow/ }))
			.toBeVisible();
		await expect
			.poll(() =>
				document.querySelector(".book-cover-frame img")?.getAttribute("src"),
			)
			.toMatch(/^blob:/);

		// Applying the candidate (cover row checked by default) must NOT clobber
		// the staged file cover with the candidate's url cover — NU CDN urls are
		// Cloudflare-blocked and would fail at Save.
		await screen.getByRole("button", { name: /Cocooned Cow/ }).click();
		await screen.getByRole("button", { name: "Apply selected" }).click();
		await expect
			.element(screen.getByLabelText("Title"))
			.toHaveValue("Martial World");
		await expect
			.poll(() =>
				document.querySelector(".book-cover-frame img")?.getAttribute("src"),
			)
			.toMatch(/^blob:/);
	});

	it("keeps saved details and offers paste guidance when a candidate cover can't be fetched", async () => {
		mocks.fetchCandidates.mockResolvedValue([
			{
				title: "Martial World",
				author: "Cocooned Cow",
				coverUrl: "https://cdn.example.com/cover.jpg",
				source: "openlibrary",
			},
		]);
		// Browser-side fetch fails (CORS) and the server proxy is blocked (403) —
		// the NovelUpdates cover reality.
		const fetchSpy = vi
			.spyOn(window, "fetch")
			.mockRejectedValue(new TypeError("Failed to fetch"));
		mocks.fetchCoverImage.mockRejectedValue(
			new Error("Image fetch failed (403)."),
		);
		const onClose = vi.fn();
		try {
			const screen = await render(
				<EditBookDialog book={book} onClose={onClose} />,
			);

			await screen.getByRole("button", { name: "Fetch metadata" }).click();
			await screen.getByRole("button", { name: "Search online" }).click();
			await screen.getByRole("button", { name: /Cocooned Cow/ }).click();
			await screen.getByRole("button", { name: "Apply selected" }).click();
			await screen.getByRole("button", { name: "Save" }).click();

			// The details commit; the cover failure is reported with a way forward
			// and the dialog stays open.
			await expect
				.element(screen.getByText(/Details saved, but the cover/))
				.toBeVisible();
			expect(mocks.updateBookMetadata).toHaveBeenCalledWith({
				bookId: "book1",
				title: "Martial World",
				author: "Cocooned Cow",
			});
			expect(onClose).not.toHaveBeenCalled();
		} finally {
			fetchSpy.mockRestore();
		}
	});
});
