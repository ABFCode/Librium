// Whole-book search scan over the per-section text cache. The cache stores
// original and pre-lowercased text so scans are pure indexOf — no repeated
// lowercasing of megabytes per keystroke. Pure and synchronous; the caller
// owns chunking/yielding for very large books.

export type SectionText = {
	texts: string[];
	lower: string[];
};

export type SearchMatch = {
	sectionIndex: number;
	blockIndex: number;
	snippet: string;
};

export function scanSections(
	perSection: SectionText[],
	query: string,
	cap: number,
	startSection = 0,
	endSection = perSection.length,
): SearchMatch[] {
	const q = query.toLowerCase();
	const out: SearchMatch[] = [];
	if (q.length === 0) {
		return out;
	}
	for (let s = startSection; s < endSection && out.length < cap; s++) {
		const { texts, lower } = perSection[s];
		for (let b = 0; b < texts.length && out.length < cap; b++) {
			const pos = lower[b].indexOf(q);
			if (pos >= 0) {
				const start = Math.max(0, pos - 40);
				const end = Math.min(texts[b].length, pos + q.length + 40);
				out.push({
					sectionIndex: s,
					blockIndex: b,
					snippet: texts[b].slice(start, end),
				});
			}
		}
	}
	return out;
}
