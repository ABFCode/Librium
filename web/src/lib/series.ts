import type { LibraryBook } from "../components/BookCard";

// Numeric-aware, case-insensitive ordering: "Vol 2" < "Vol 10", "1.5" between
// "1" and "2" (as strings "1.5" sorts after "1" and before "2" numerically).
const collator = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: "base",
});

export type SeriesGroup = {
	// null = books with no series metadata (rendered last, as one group).
	series: string | null;
	books: LibraryBook[];
};

// Groups the (already filtered) shelf by series name, A→Z; books inside a
// series order by seriesIndex (numeric-aware), falling back to title.
// Standalone books keep their incoming order (the active sort) in one
// trailing group.
export function groupBySeries(books: LibraryBook[]): SeriesGroup[] {
	const bySeries = new Map<string, LibraryBook[]>();
	const standalone: LibraryBook[] = [];
	for (const book of books) {
		const series = book.series?.trim();
		if (!series) {
			standalone.push(book);
			continue;
		}
		const group = bySeries.get(series);
		if (group) {
			group.push(book);
		} else {
			bySeries.set(series, [book]);
		}
	}
	const groups: SeriesGroup[] = [...bySeries.entries()]
		.sort((a, b) => collator.compare(a[0], b[0]))
		.map(([series, grouped]) => ({
			series,
			books: [...grouped].sort((a, b) => {
				const aIndex = a.seriesIndex?.trim();
				const bIndex = b.seriesIndex?.trim();
				if (aIndex && bIndex && aIndex !== bIndex) {
					return collator.compare(aIndex, bIndex);
				}
				if (aIndex && !bIndex) {
					return -1;
				}
				if (!aIndex && bIndex) {
					return 1;
				}
				return collator.compare(a.title, b.title);
			}),
		}));
	if (standalone.length > 0) {
		groups.push({ series: null, books: standalone });
	}
	return groups;
}
