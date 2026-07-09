import { describe, expect, it, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import { useImportFlow } from "../hooks/useImportFlow";

vi.mock("convex/react", () => ({
	useConvexAuth: () => ({ isAuthenticated: true }),
	useMutation: () => vi.fn(),
	useAction: () => vi.fn(),
	useQuery: () => [],
	useConvex: () => ({ query: vi.fn() }),
}));

describe("useImportFlow", () => {
	it("filters unsupported files and reports an error", async () => {
		const { result, act } = await renderHook(() => useImportFlow());
		const image = new File(["not a book"], "cover.jpg", {
			type: "image/jpeg",
		});

		await act(() => {
			result.current.addFiles([image]);
		});

		expect(result.current.files).toHaveLength(0);
		expect(result.current.error).toBe(
			"Only EPUB, .txt, and .md files are supported.",
		);
	});

	it("accepts .txt and .md webnovel rips", async () => {
		const { result, act } = await renderHook(() => useImportFlow());
		const txt = new File(["Chapter 1\n\nOnce upon a time."], "rip.txt", {
			type: "text/plain",
		});
		const md = new File(["# Title\n\nProse."], "notes.md", {
			type: "text/markdown",
		});

		await act(() => {
			result.current.addFiles([txt, md]);
		});

		expect(result.current.files).toHaveLength(2);
		expect(result.current.error).toBeNull();
	});

	it("deduplicates files by name, size, and lastModified", async () => {
		const { result, act } = await renderHook(() => useImportFlow());
		const first = new File(["a"], "book.epub", {
			type: "application/epub+zip",
			lastModified: 123,
		});
		const duplicate = new File(["a"], "book.epub", {
			type: "application/epub+zip",
			lastModified: 123,
		});
		const second = new File(["b"], "other.epub", {
			type: "application/epub+zip",
			lastModified: 456,
		});

		await act(() => {
			result.current.addFiles([first, second]);
		});
		expect(result.current.files).toHaveLength(2);

		await act(() => {
			result.current.addFiles([duplicate]);
		});
		expect(result.current.files).toHaveLength(2);
	});
});
