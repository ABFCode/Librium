// Parsed-block payload shapes (as stored per section in IndexedDB) and
// plain-text projection, used by the reader's search and by tests.

export type InlinePayload = {
	kind: string;
	text?: string;
	href?: string;
	src?: string;
	alt?: string;
	width?: number;
	height?: number;
	emph?: boolean;
	strong?: boolean;
	code?: boolean;
};

export type TableCellPayload = {
	inlines: InlinePayload[];
	header?: boolean;
};

export type TablePayload = {
	rows: { cells: TableCellPayload[] }[];
};

export type FigurePayload = {
	images: InlinePayload[];
	caption: InlinePayload[];
};

export type BlockPayload = {
	kind: string;
	level?: number;
	ordered?: boolean;
	listIndex?: number;
	inlines?: InlinePayload[];
	table?: TablePayload;
	figure?: FigurePayload;
	anchors?: string[];
};

export function inlineToText(inline: InlinePayload) {
	if (inline.kind === "image") {
		// Padded so alt text can't fuse with the surrounding runs when joined.
		return inline.alt ? ` ${inline.alt} ` : "";
	}
	return inline.text ?? "";
}

export function inlinesToText(inlines?: InlinePayload[]) {
	if (!inlines || inlines.length === 0) {
		return "";
	}
	// Text runs carry their own separator spaces (spine ≥0.1.1) — joining with
	// " " would put gaps around every styled run: "(<i>sic</i>)" → "( sic )".
	return inlines.map(inlineToText).join("").replace(/ {2,}/g, " ").trim();
}

export function blockToText(block: BlockPayload) {
	if (block.table?.rows) {
		return block.table.rows
			.map((row) =>
				row.cells.map((cell) => inlinesToText(cell.inlines)).join(" "),
			)
			.join("\n")
			.trim();
	}
	if (block.figure) {
		const caption = inlinesToText(block.figure.caption);
		if (caption) {
			return caption;
		}
		return inlinesToText(block.figure.images);
	}
	return inlinesToText(block.inlines);
}
