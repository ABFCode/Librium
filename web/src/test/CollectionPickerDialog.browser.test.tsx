import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CollectionPickerDialog } from "../components/CollectionPickerDialog";
import type { LocalCollection } from "../lib/db";

const collections: LocalCollection[] = [
	{
		clientKey: "ck-fantasy",
		name: "Fantasy",
		createdAt: 1,
		nameEditedAt: 1,
		dirty: 0,
	},
	{
		clientKey: "ck-scifi",
		name: "Sci-fi",
		createdAt: 2,
		nameEditedAt: 2,
		dirty: 0,
	},
];

describe("CollectionPickerDialog", () => {
	it("toggles membership: adds when not all selected books are members", async () => {
		const onAdd = vi.fn();
		const onRemove = vi.fn();
		const screen = await render(
			<CollectionPickerDialog
				bookIds={["b1", "b2"]}
				collections={collections}
				membershipsByBook={new Map([["b1", new Set(["ck-fantasy"])]])}
				onAdd={onAdd}
				onRemove={onRemove}
				onCreate={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		// b1 is in Fantasy, b2 isn't → partial → clicking adds the rest.
		await screen.getByRole("button", { name: /Fantasy/ }).click();
		expect(onAdd).toHaveBeenCalledWith("ck-fantasy", ["b1", "b2"]);
		expect(onRemove).not.toHaveBeenCalled();
	});

	it("toggles membership: removes when every selected book is a member", async () => {
		const onAdd = vi.fn();
		const onRemove = vi.fn();
		const screen = await render(
			<CollectionPickerDialog
				bookIds={["b1"]}
				collections={collections}
				membershipsByBook={new Map([["b1", new Set(["ck-scifi"])]])}
				onAdd={onAdd}
				onRemove={onRemove}
				onCreate={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		await screen.getByRole("button", { name: /Sci-fi/ }).click();
		expect(onRemove).toHaveBeenCalledWith("ck-scifi", ["b1"]);
		expect(onAdd).not.toHaveBeenCalled();
	});

	it("creates a collection and adds the selected books to it", async () => {
		const onAdd = vi.fn();
		const onCreate = vi.fn().mockResolvedValue("ck-new");
		const screen = await render(
			<CollectionPickerDialog
				bookIds={["b1", "b2"]}
				collections={collections}
				membershipsByBook={new Map()}
				onAdd={onAdd}
				onRemove={vi.fn()}
				onCreate={onCreate}
				onClose={vi.fn()}
			/>,
		);

		await screen.getByPlaceholder("New collection…").fill("Webnovels");
		await screen.getByRole("button", { name: /Create/ }).click();
		expect(onCreate).toHaveBeenCalledWith("Webnovels");
		await expect.poll(() => onAdd.mock.calls.length).toBeGreaterThan(0);
		expect(onAdd).toHaveBeenCalledWith("ck-new", ["b1", "b2"]);
	});
});
