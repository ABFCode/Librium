import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "../components/RequireAuth";
import { type QueueItem, useImportFlow } from "../hooks/useImportFlow";
import { filesFromDataTransfer } from "../lib/fileTree";

export const Route = createFileRoute("/import")({
	component: ImportPage,
});

const statusChip = (item: QueueItem) => {
	switch (item.status) {
		case "done":
			return "is-done";
		case "failed":
			return "is-failed";
		case "importing":
			return "is-importing";
		default:
			return "is-queued";
	}
};

const statusLabel = (item: QueueItem) => {
	switch (item.status) {
		case "done":
			return "Ready";
		case "failed":
			return "Failed";
		case "importing":
			return "Importing";
		default:
			return "Queued";
	}
};

function ImportPage() {
	const {
		queue,
		files,
		isDragging,
		setIsDragging,
		error,
		setError,
		isUploading,
		isAuthenticated,
		submit,
		addFiles,
	} = useImportFlow();

	const handleDrop = async (event: React.DragEvent) => {
		event.preventDefault();
		setIsDragging(false);
		try {
			const dropped = await filesFromDataTransfer(event.dataTransfer);
			if (dropped.length > 0) {
				addFiles(dropped);
			}
		} catch {
			setError("Could not read the dropped files.");
		}
	};

	const finished = queue.filter(
		(item) => item.status === "done" || item.status === "failed",
	).length;

	return (
		<RequireAuth>
			<div className="min-h-screen px-6 pb-16 pt-8">
				<div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
					<div>
						<h1 className="text-3xl">Add books</h1>
						<p className="mt-1 text-sm text-[var(--muted-2)]">
							Drop EPUBs — or an entire folder of them.
						</p>
					</div>

					{/* biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop is inherently pointer-only; the file/folder pickers below are the accessible path */}
					<div
						className={`dropzone min-h-[200px] px-6 py-10 text-sm text-[var(--muted)] ${
							isDragging ? "is-dragging" : ""
						}`}
						onDragEnter={(event) => {
							event.preventDefault();
							setIsDragging(true);
						}}
						onDragOver={(event) => {
							event.preventDefault();
							setIsDragging(true);
						}}
						onDragLeave={() => setIsDragging(false)}
						onDrop={handleDrop}
					>
						<p className="text-base font-semibold text-[var(--ink)]">
							Drop EPUBs or folders here
						</p>
						<p className="mt-1.5 text-sm text-[var(--muted-2)]">
							{files.length > 0
								? `${files.length} file${files.length === 1 ? "" : "s"} ready to import`
								: "or pick them below"}
						</p>
						<div className="mt-6 flex flex-wrap items-center justify-center gap-2">
							<label className="upload-control">
								Choose files
								<input
									className="upload-input"
									type="file"
									multiple
									accept=".epub,application/epub+zip"
									onChange={(event) => {
										if (event.target.files) {
											addFiles(event.target.files);
										}
										event.target.value = "";
									}}
								/>
							</label>
							<label className="upload-control">
								Choose folder
								<input
									className="upload-input"
									type="file"
									multiple
									{...({ webkitdirectory: "" } as Record<string, string>)}
									onChange={(event) => {
										if (event.target.files) {
											addFiles(event.target.files);
										}
										event.target.value = "";
									}}
								/>
							</label>
							<button
								type="button"
								className="btn btn-primary"
								onClick={submit}
								disabled={isUploading || files.length === 0 || !isAuthenticated}
							>
								{isUploading
									? `Importing… (${finished}/${queue.length})`
									: `Import${files.length > 0 ? ` ${files.length}` : ""} book${files.length === 1 ? "" : "s"}`}
							</button>
						</div>
					</div>

					{error ? (
						<p className="text-sm text-[var(--danger)]">{error}</p>
					) : null}
					{!isAuthenticated ? (
						<p className="text-sm text-[var(--muted)]">
							Sign in to upload and sync your library.
						</p>
					) : null}

					{queue.length > 0 ? (
						<div className="flex flex-col gap-1.5">
							{queue.map((item) => (
								<div
									key={item.id}
									className="surface-soft flex items-center justify-between gap-4 px-3 py-2 text-sm"
								>
									<div className="min-w-0 flex-1">
										<div className="truncate font-medium">
											{item.title ?? item.file.name}
										</div>
										{item.error ? (
											<div className="mt-0.5 truncate text-xs text-[var(--danger)]">
												{item.error}
											</div>
										) : null}
									</div>
									<span className={`queue-status shrink-0 ${statusChip(item)}`}>
										{statusLabel(item)}
									</span>
								</div>
							))}
						</div>
					) : null}
				</div>
			</div>
		</RequireAuth>
	);
}
