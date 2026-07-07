import { useEffect, useState } from "react";
import type { LocalCollection } from "../lib/db";
import { Icon } from "./Icon";

type CollectionPickerDialogProps = {
	// The books being organized (one from a card menu, many from bulk select).
	bookIds: string[];
	collections: LocalCollection[];
	membershipsByBook: Map<string, Set<string>>;
	onAdd: (collectionKey: string, bookIds: string[]) => void;
	onRemove: (collectionKey: string, bookIds: string[]) => void;
	// Creates the collection and returns its clientKey; the dialog then adds
	// the selected books to it.
	onCreate: (name: string) => Promise<string>;
	onClose: () => void;
};

export const CollectionPickerDialog = ({
	bookIds,
	collections,
	membershipsByBook,
	onAdd,
	onRemove,
	onCreate,
	onClose,
}: CollectionPickerDialogProps) => {
	const [newName, setNewName] = useState("");

	useEffect(() => {
		const handleKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [onClose]);

	const membershipCount = (collectionKey: string) =>
		bookIds.filter((id) => membershipsByBook.get(id)?.has(collectionKey))
			.length;

	const createAndAdd = async () => {
		const name = newName.trim();
		if (!name) {
			return;
		}
		const key = await onCreate(name);
		onAdd(key, bookIds);
		setNewName("");
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close is a pointer nicety; Escape and the Done button cover keyboard users
		// biome-ignore lint/a11y/useKeyWithClickEvents: see above
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-6"
			onClick={onClose}
		>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: the click handler only stops backdrop-close propagation */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: see above */}
			<div
				className="surface w-full max-w-sm p-6"
				onClick={(event) => event.stopPropagation()}
			>
				<h2 className="text-xl">Add to collection</h2>
				<p className="mt-1 text-sm text-[var(--muted)]">
					{bookIds.length === 1
						? "Choose collections for this book."
						: `Choose collections for ${bookIds.length} books.`}
				</p>
				<div className="mt-4 flex max-h-64 flex-col gap-1 overflow-auto">
					{collections.length === 0 ? (
						<p className="text-sm text-[var(--muted-2)]">
							No collections yet — create one below.
						</p>
					) : (
						collections.map((collection) => {
							const count = membershipCount(collection.clientKey);
							const all = count === bookIds.length;
							const some = count > 0 && !all;
							return (
								<button
									type="button"
									key={collection.clientKey}
									className="menu-item is-checkable"
									onClick={() =>
										all
											? onRemove(collection.clientKey, bookIds)
											: onAdd(collection.clientKey, bookIds)
									}
								>
									<span className="menu-check">
										{all ? <Icon name="check" size={12} /> : some ? "–" : null}
									</span>
									<span className="min-w-0 flex-1 truncate text-left">
										{collection.name}
									</span>
								</button>
							);
						})
					)}
				</div>
				<div className="mt-4 flex items-center gap-2">
					<input
						className="input h-9 flex-1"
						placeholder="New collection…"
						value={newName}
						onChange={(event) => setNewName(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								void createAndAdd();
							}
						}}
					/>
					<button
						type="button"
						className="btn btn-ghost h-9 shrink-0 text-xs"
						disabled={!newName.trim()}
						onClick={() => void createAndAdd()}
					>
						<Icon name="plus" size={14} />
						Create
					</button>
				</div>
				<div className="mt-5 flex justify-end">
					<button
						type="button"
						className="btn btn-primary text-xs"
						onClick={onClose}
					>
						Done
					</button>
				</div>
			</div>
		</div>
	);
};
