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
	const first = nodes[0] as HTMLElement | undefined;
	// The leading content inset belongs to the section, not to block zero.
	// Preserve a true section-start anchor while the viewport is above (or
	// exactly at) the first rendered block so restoring it does not turn the
	// block's padding-derived offsetTop into an unwanted scroll offset.
	if (!first || scrollTop <= first.offsetTop) {
		return { blockIndex: 0, fraction: 0, sectionFraction: 0 };
	}
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
	// (0, 0) is the canonical section-start anchor, including chapters whose
	// duplicate first heading is omitted and therefore have no rendered block 0.
	if (blockIndex === 0 && fraction === 0) {
		return 0;
	}
	const target = container.querySelector(
		`[data-chunk-index="${blockIndex}"]`,
	) as HTMLElement | null;
	if (!target) {
		return null;
	}
	return target.offsetTop + clamp01(fraction) * target.clientHeight;
}

/**
 * Places an explicitly selected search/bookmark anchor below the reader's
 * visible content inset. Progress restoration intentionally uses the raw
 * anchor above; navigation destinations must be visible beneath fixed chrome.
 */
export function visibleAnchorScrollTop(
	container: HTMLElement,
	blockIndex: number,
	fraction: number,
): number | null {
	const top = anchorScrollTop(container, blockIndex, fraction);
	if (top === null || top === 0) {
		return top;
	}
	const inset = Number.parseFloat(
		window.getComputedStyle(container).scrollPaddingTop,
	);
	return Math.max(0, top - (Number.isFinite(inset) ? inset : 0));
}
