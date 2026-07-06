// Book-level reading progress: completed chapters plus the fraction of the
// current one. Chosen so a freshly imported book reads 0%, a single-chapter
// book can progress, and finishing the last chapter reaches exactly 100%.
// Mirrors the server-side formula in convex/userBooks.ts (listByUser).
export function bookProgress(
	sectionIndex: number,
	sectionFraction: number,
	totalSections: number,
): number {
	if (totalSections <= 0) {
		return 0;
	}
	const fraction = Math.min(Math.max(sectionFraction, 0), 1);
	return Math.min((sectionIndex + fraction) / totalSections, 1);
}
