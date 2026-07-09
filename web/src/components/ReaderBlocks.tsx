import type { JSX, ReactNode } from "react";
import { memo } from "react";
import {
	type BlockPayload,
	blockToText,
	type InlinePayload,
} from "../lib/blockText";
import { resolveInternalSectionId } from "../lib/readerLinks";

// The reader's parsed-block → JSX renderer, extracted from ReaderExperience so
// the (large, purely-presentational) rendering lives apart from the reader's
// state machine. Given a section's blocks it emits the chapter body; the only
// wiring it needs is the image object-URL map and an internal-link resolver.

type ReaderBlocksProps = {
	blocks: BlockPayload[];
	// Object URLs keyed by archive-relative image href (or undefined offline).
	imageUrls?: Record<string, string>;
	// The active section, for the skip-duplicate-first-heading rule and for
	// resolving relative internal links.
	activeSectionTitle?: string;
	activeSectionHref?: string;
	// href#anchor / href / #anchor → section id, from the reader's link index.
	sectionLinkIndex: Map<string, string>;
	// Navigate to another section (internal link click).
	onNavigateToSection: (sectionId: string) => void;
};

// spine ≥0.7: styling is orthogonal to structure — combinable emph/strong/code
// flags on any inline (so <strong><em>x</em></strong> keeps both).
function wrapInlineStyles(inline: InlinePayload, node: ReactNode): ReactNode {
	let out = node;
	if (inline.code) {
		out = <code>{out}</code>;
	}
	if (inline.emph) {
		out = <em>{out}</em>;
	}
	if (inline.strong) {
		out = <strong>{out}</strong>;
	}
	return out;
}

// memo: every prop is referentially stable across the reader's chrome
// show/hide toggle (blocks/imageUrls are per-section state, sectionLinkIndex
// is memoized, the navigate callback is a setState) — without this, each
// chrome flip re-rendered the whole chapter's block tree for nothing.
export const ReaderBlocks = memo(function ReaderBlocks({
	blocks,
	imageUrls,
	activeSectionTitle,
	activeSectionHref,
	sectionLinkIndex,
	onNavigateToSection,
}: ReaderBlocksProps) {
	const renderInlines = (inlines?: InlinePayload[], keyPrefix = "inline") => {
		if (!inlines || inlines.length === 0) {
			return null;
		}
		return inlines.map((inline, index) => {
			const key = `${keyPrefix}-${index}`;
			switch (inline.kind) {
				// "emphasis"/"strong"/"code" kinds only exist in blocks parsed by
				// spine <0.7 (still on disk until the book re-parses).
				case "emphasis":
					return <em key={key}>{inline.text}</em>;
				case "strong":
					return <strong key={key}>{inline.text}</strong>;
				case "link": {
					const href = inline.href ?? "#";
					const external =
						href.startsWith("http://") ||
						href.startsWith("https://") ||
						href.startsWith("mailto:") ||
						href.startsWith("tel:") ||
						href.startsWith("data:");
					const targetSectionId = !external
						? resolveInternalSectionId(
								href,
								activeSectionHref,
								sectionLinkIndex,
							)
						: null;
					return (
						<a
							key={key}
							href={href}
							className="reader-link"
							target={external ? "_blank" : undefined}
							rel={external ? "noreferrer" : undefined}
							onClick={(event) => {
								if (!external) {
									event.preventDefault();
									if (targetSectionId) {
										onNavigateToSection(targetSectionId);
									}
								}
							}}
						>
							{wrapInlineStyles(inline, inline.text)}
						</a>
					);
				}
				case "image": {
					const src = inline.src ? imageUrls?.[inline.src] : undefined;
					if (!src) {
						return null;
					}
					const width =
						inline.width && inline.width > 0 ? inline.width : undefined;
					const height =
						inline.height && inline.height > 0 ? inline.height : undefined;
					return (
						<img
							key={key}
							src={src}
							alt={inline.alt ?? ""}
							width={width}
							height={height}
							style={
								width && height
									? { aspectRatio: `${width}/${height}` }
									: undefined
							}
							className="reader-image"
							loading="lazy"
						/>
					);
				}
				case "code":
					return <code key={key}>{inline.text}</code>;
				default:
					// "text" runs carry the style flags; plain text passes through.
					return <span key={key}>{wrapInlineStyles(inline, inline.text)}</span>;
			}
		});
	};

	const nodes: JSX.Element[] = [];
	const normalizedTitle = activeSectionTitle
		? activeSectionTitle.trim().toLowerCase()
		: null;
	const shouldSkipFirstHeading =
		normalizedTitle &&
		blocks.length > 0 &&
		blocks[0].kind === "heading" &&
		blockToText(blocks[0]).trim().toLowerCase() === normalizedTitle;
	for (let i = 0; i < blocks.length; i += 1) {
		if (i === 0 && shouldSkipFirstHeading) {
			continue;
		}
		const block = blocks[i];
		if (block.kind === "list_item") {
			const ordered = Boolean(block.ordered);
			const items: BlockPayload[] = [block];
			let j = i + 1;
			while (
				j < blocks.length &&
				blocks[j].kind === "list_item" &&
				Boolean(blocks[j].ordered) === ordered
			) {
				items.push(blocks[j]);
				j += 1;
			}
			i = j - 1;
			const ListTag = ordered ? "ol" : "ul";
			nodes.push(
				<ListTag key={`list-${i}`} className="reader-list">
					{items.map((item, itemIndex) => (
						<li
							// biome-ignore lint/suspicious/noArrayIndexKey: chapter blocks are static per load and never reorder
							key={`list-item-${i}-${itemIndex}`}
							data-chunk-index={i + itemIndex}
						>
							{renderInlines(item.inlines, `li-${i}-${itemIndex}`)}
						</li>
					))}
				</ListTag>,
			);
			continue;
		}
		if (block.kind === "heading") {
			const level = Math.min(6, Math.max(1, block.level ?? 2));
			const Tag = `h${level}` as keyof JSX.IntrinsicElements;
			nodes.push(
				<Tag
					key={`heading-${i}`}
					data-chunk-index={i}
					className="reader-heading"
				>
					{renderInlines(block.inlines, `heading-${i}`)}
				</Tag>,
			);
			continue;
		}
		if (block.kind === "blockquote") {
			nodes.push(
				<blockquote
					key={`quote-${i}`}
					data-chunk-index={i}
					className="reader-quote"
				>
					{renderInlines(block.inlines, `quote-${i}`)}
				</blockquote>,
			);
			continue;
		}
		if (block.kind === "pre") {
			nodes.push(
				<pre key={`pre-${i}`} data-chunk-index={i} className="reader-pre">
					<code>{renderInlines(block.inlines, `pre-${i}`)}</code>
				</pre>,
			);
			continue;
		}
		if (block.kind === "hr") {
			nodes.push(
				<hr key={`hr-${i}`} data-chunk-index={i} className="reader-hr" />,
			);
			continue;
		}
		if (block.kind === "table" && block.table) {
			nodes.push(
				<div key={`table-${i}`} data-chunk-index={i} className="reader-table">
					<table>
						<tbody>
							{block.table.rows.map((row, rowIndex) => (
								<tr
									// biome-ignore lint/suspicious/noArrayIndexKey: chapter tables are static per load and never reorder
									key={`row-${i}-${rowIndex}`}
								>
									{row.cells.map((cell, cellIndex) =>
										cell.header ? (
											<th
												// biome-ignore lint/suspicious/noArrayIndexKey: chapter tables are static per load and never reorder
												key={`cell-${i}-${rowIndex}-${cellIndex}`}
											>
												{renderInlines(
													cell.inlines,
													`cell-${i}-${rowIndex}-${cellIndex}`,
												)}
											</th>
										) : (
											<td
												// biome-ignore lint/suspicious/noArrayIndexKey: chapter tables are static per load and never reorder
												key={`cell-${i}-${rowIndex}-${cellIndex}`}
											>
												{renderInlines(
													cell.inlines,
													`cell-${i}-${rowIndex}-${cellIndex}`,
												)}
											</td>
										),
									)}
								</tr>
							))}
						</tbody>
					</table>
				</div>,
			);
			continue;
		}
		if (block.kind === "figure" && block.figure) {
			nodes.push(
				<figure
					key={`figure-${i}`}
					data-chunk-index={i}
					className="reader-figure"
				>
					<div className="reader-figure-images">
						{block.figure.images.map((inline, idx) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: figure images are static per load and never reorder
								key={`fig-${i}-${idx}`}
							>
								{renderInlines([inline], `fig-${i}-${idx}`)}
							</div>
						))}
					</div>
					{block.figure.caption.length > 0 ? (
						<figcaption className="reader-figure-caption">
							{renderInlines(block.figure.caption, `figcap-${i}`)}
						</figcaption>
					) : null}
				</figure>,
			);
			continue;
		}
		nodes.push(
			<p key={`para-${i}`} data-chunk-index={i} className="reader-paragraph">
				{renderInlines(block.inlines, `para-${i}`)}
			</p>,
		);
	}
	return <>{nodes}</>;
});
