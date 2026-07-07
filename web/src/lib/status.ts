// Reading status: explicit user choice, or derived from progress when unset.

export type ReadingStatus = "reading" | "finished" | "want" | "abandoned";

export const STATUS_OPTIONS: { key: ReadingStatus; label: string }[] = [
	{ key: "reading", label: "Reading" },
	{ key: "want", label: "Want to read" },
	{ key: "finished", label: "Finished" },
	{ key: "abandoned", label: "Abandoned" },
];

export const statusLabel = (status: ReadingStatus): string =>
	STATUS_OPTIONS.find((option) => option.key === status)?.label ?? status;

// An explicit status always wins; otherwise derive from progress. The 0.99
// threshold treats "read to the last screen" as finished — progress is
// (completed sections + fraction) / total, which only hits exactly 1 at the
// very bottom of the final chapter.
export function effectiveStatus(
	explicit: ReadingStatus | null | undefined,
	progress: number,
): ReadingStatus {
	if (explicit) {
		return explicit;
	}
	if (progress >= 0.99) {
		return "finished";
	}
	if (progress > 0) {
		return "reading";
	}
	return "want";
}
