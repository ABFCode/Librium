import { useEffect, useState } from "react";
import type { LocalCollection } from "../lib/db";
import { Icon } from "./Icon";

type ManageCollectionsDialogProps = {
	collections: LocalCollection[];
	// Books per collection, for the count line and delete copy.
	countByCollection: Map<string, number>;
	onRename: (collectionKey: string, name: string) => void;
	// Parent routes this through its confirm dialog before deleting.
	onDelete: (collectionKey: string, name: string) => void;
	onClose: () => void;
};

export const ManageCollectionsDialog = ({
	collections,
	countByCollection,
	onRename,
	onDelete,
	onClose,
}: ManageCollectionsDialogProps) => {
	const [editingKey, setEditingKey] = useState<string | null>(null);
	const [editName, setEditName] = useState("");

	useEffect(() => {
		const handleKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				// Editing? Escape backs out of the rename first, not the dialog.
				if (editingKey !== null) {
					setEditingKey(null);
					return;
				}
				onClose();
			}
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [onClose, editingKey]);

	const commitRename = (collectionKey: string) => {
		const name = editName.trim();
		if (name) {
			onRename(collectionKey, name);
		}
		setEditingKey(null);
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
				<h2 className="text-xl">Collections</h2>
				<div className="mt-4 flex max-h-72 flex-col gap-1 overflow-auto">
					{collections.length === 0 ? (
						<p className="text-sm text-[var(--muted-2)]">
							No collections yet. Create one from a book's menu.
						</p>
					) : (
						collections.map((collection) => (
							<div
								key={collection.clientKey}
								className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5"
							>
								{editingKey === collection.clientKey ? (
									<>
										<input
											className="input h-8 min-w-0 flex-1 text-sm"
											value={editName}
											// biome-ignore lint/a11y/noAutofocus: focus follows the just-clicked rename action into its input
											autoFocus
											onChange={(event) => setEditName(event.target.value)}
											onKeyDown={(event) => {
												if (event.key === "Enter") {
													commitRename(collection.clientKey);
												}
											}}
										/>
										<button
											type="button"
											className="icon-btn shrink-0"
											disabled={!editName.trim()}
											onClick={() => commitRename(collection.clientKey)}
										>
											<span className="sr-only">Save name</span>
											<Icon name="check" size={14} />
										</button>
									</>
								) : (
									<>
										<span className="min-w-0 flex-1 truncate text-sm">
											{collection.name}
											<span className="ml-2 text-xs text-[var(--muted-2)]">
												{countByCollection.get(collection.clientKey) ?? 0}
											</span>
										</span>
										<button
											type="button"
											className="icon-btn shrink-0"
											onClick={() => {
												setEditingKey(collection.clientKey);
												setEditName(collection.name);
											}}
										>
											<span className="sr-only">Rename collection</span>
											<Icon name="pencil" size={14} />
										</button>
										<button
											type="button"
											className="icon-btn shrink-0 hover:text-rose-300"
											onClick={() =>
												onDelete(collection.clientKey, collection.name)
											}
										>
											<span className="sr-only">Delete collection</span>
											<Icon name="trash" size={14} />
										</button>
									</>
								)}
							</div>
						))
					)}
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
