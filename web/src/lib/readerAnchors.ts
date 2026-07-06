// Layout-independent reading anchors: a position is (block index, fraction
// 0–1 within that block), so it restores exactly across devices, font sizes,
// and widths. Single source of the anchor math for progress saves, restore,
// re-anchoring, bookmarks, and search jumps.

export const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

export type Anchor = {
	blockIndex: number;
	fraction: number;
	// How far through the whole section the viewport top is (block position
	// plus intra-block fraction) — used by percent displays so partial
	// chapters count. Reads 1 when scrolled to the very end of the content.
	sectionFraction: number;
};

export function findAnchor(container: HTMLElement): Anchor {
	const scrollTop = container.scrollTop;
	let blockIndex = 0;
	let fraction = 0;
	let sectionFraction = 0;
	const nodes = Array.from(container.querySelectorAll("[data-chunk-index]"));
	for (let i = 0; i < nodes.length; i++) {
		const element = nodes[i] as HTMLElement;
		if (element.offsetTop + element.clientHeight > scrollTop) {
			blockIndex = Number(element.dataset.chunkIndex ?? 0);
			fraction =
				element.clientHeight > 0
					? clamp01((scrollTop - element.offsetTop) / element.clientHeight)
					: 0;
			sectionFraction =
				nodes.length > 0 ? clamp01((i + fraction) / nodes.length) : 0;
			// Bottom of the viewport at the end of the content = finished.
			if (
				container.scrollTop + container.clientHeight >=
				container.scrollHeight - 4
			) {
				sectionFraction = 1;
			}
			break;
		}
	}
	return { blockIndex, fraction, sectionFraction };
}

export function anchorScrollTop(
	container: HTMLElement,
	blockIndex: number,
	fraction: number,
): number | null {
	const target = container.querySelector(
		`[data-chunk-index="${blockIndex}"]`,
	) as HTMLElement | null;
	if (!target) {
		return null;
	}
	return target.offsetTop + clamp01(fraction) * target.clientHeight;
}
