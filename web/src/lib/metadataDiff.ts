import type { MetadataCandidate } from "../../convex/metadataProviders";

// Pure diff between the book's current (form) values and a fetched
// candidate — one row per field the candidate would actually change. The
// preview built from these rows IS the safety mechanism: nothing applies
// without the user seeing current vs proposed and leaving the box checked.

export type DiffField =
	| "title"
	| "author"
	| "series"
	| "description"
	| "subjects";

export type FieldDiff = {
	field: DiffField;
	label: string;
	// Display strings ("" = currently unset).
	current: string;
	proposed: string;
	// Raw value to apply when accepted.
	value: string | string[];
};

export type DiffableCurrent = {
	title: string;
	author: string;
	series: string;
	description: string;
	subjects?: string[];
};

export function diffCandidate(
	current: DiffableCurrent,
	candidate: MetadataCandidate,
): FieldDiff[] {
	const out: FieldDiff[] = [];
	const text = (
		field: Exclude<DiffField, "subjects">,
		label: string,
		proposed: string | undefined,
	) => {
		const next = proposed?.trim();
		if (!next || next === current[field].trim()) {
			return;
		}
		out.push({
			field,
			label,
			current: current[field].trim(),
			proposed: next,
			value: next,
		});
	};
	text("title", "Title", candidate.title);
	text("author", "Author", candidate.author);
	text("series", "Series", candidate.series);
	text("description", "Description", candidate.description);
	const proposedSubjects = (candidate.subjects ?? [])
		.map((s) => s.trim())
		.filter(Boolean);
	const currentSubjects = (current.subjects ?? [])
		.map((s) => s.trim())
		.filter(Boolean);
	if (
		proposedSubjects.length > 0 &&
		proposedSubjects.join(", ") !== currentSubjects.join(", ")
	) {
		out.push({
			field: "subjects",
			label: "Subjects",
			current: currentSubjects.join(", "),
			proposed: proposedSubjects.join(", "),
			value: proposedSubjects,
		});
	}
	return out;
}
