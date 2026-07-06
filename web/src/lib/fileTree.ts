// Extract Files from a drop event, recursing into dropped folders via the
// FileSystemEntry API (supported in all modern browsers for drag & drop).
export async function filesFromDataTransfer(
	dataTransfer: DataTransfer,
): Promise<File[]> {
	const entries = Array.from(dataTransfer.items)
		.map((item) => item.webkitGetAsEntry?.())
		.filter((entry): entry is FileSystemEntry => !!entry);

	if (entries.length === 0) {
		return Array.from(dataTransfer.files);
	}

	const out: File[] = [];

	const walk = async (entry: FileSystemEntry): Promise<void> => {
		if (entry.isFile) {
			const file = await new Promise<File>((resolve, reject) =>
				(entry as FileSystemFileEntry).file(resolve, reject),
			);
			out.push(file);
			return;
		}
		if (entry.isDirectory) {
			const reader = (entry as FileSystemDirectoryEntry).createReader();
			// readEntries returns results in batches (typically 100) — keep
			// reading until it comes back empty.
			let batch: FileSystemEntry[];
			do {
				batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
					reader.readEntries(resolve, reject),
				);
				for (const child of batch) {
					await walk(child);
				}
			} while (batch.length > 0);
		}
	};

	for (const entry of entries) {
		await walk(entry);
	}
	return out;
}
