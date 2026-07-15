import { useAction } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { MetadataCandidate } from "../../convex/metadataProviders";
import { safeExternalHref } from "../lib/externalUrl";
import {
	type DiffableCurrent,
	type DiffField,
	diffCandidate,
} from "../lib/metadataDiff";
import { Icon } from "./Icon";

const SOURCE_LABELS: Record<MetadataCandidate["source"], string> = {
	openlibrary: "Open Library",
	googlebooks: "Google Books",
	novelupdates: "NovelUpdates",
};

type MetadataFetchPanelProps = {
	bookId: string;
	// Live form values — diffs are computed against what the user would save.
	current: DiffableCurrent;
	// A candidate produced outside the search (NovelUpdates page parse); shown
	// at the top of the list so it flows through the same diff preview.
	extraCandidate?: MetadataCandidate | null;
	onApply: (
		fields: Partial<Record<DiffField, string | string[]>>,
		coverUrl?: string,
	) => void;
};

export const MetadataFetchPanel = ({
	bookId,
	current,
	extraCandidate,
	onApply,
}: MetadataFetchPanelProps) => {
	const fetchCandidates = useAction(api.metadata.fetchCandidates);
	const [searched, setSearched] = useState<MetadataCandidate[] | null>(null);
	const [isSearching, setIsSearching] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selected, setSelected] = useState<MetadataCandidate | null>(null);
	const [unchecked, setUnchecked] = useState<Set<string>>(new Set());

	const candidates = useMemo(() => {
		const list = [...(searched ?? [])];
		if (extraCandidate) {
			list.unshift(extraCandidate);
		}
		return list;
	}, [searched, extraCandidate]);

	const diffs = useMemo(
		() => (selected ? diffCandidate(current, selected) : []),
		[selected, current],
	);
	const selectedSourceHref = safeExternalHref(selected?.sourceUrl);
	const coverProposed = Boolean(selected?.coverUrl);

	const search = async () => {
		setIsSearching(true);
		setError(null);
		setSelected(null);
		try {
			const results = await fetchCandidates({
				bookId: bookId as never,
				// Search by what's in the form now, not the last-saved doc.
				title: current.title,
				author: current.author,
			});
			setSearched(results);
			if (results.length === 0 && !extraCandidate) {
				setError("No matches found — try editing the title or author first.");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Search failed");
		} finally {
			setIsSearching(false);
		}
	};

	const toggle = (key: string) =>
		setUnchecked((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});

	const apply = () => {
		if (!selected) {
			return;
		}
		const fields: Partial<Record<DiffField, string | string[]>> = {};
		for (const diff of diffs) {
			if (!unchecked.has(diff.field)) {
				fields[diff.field] = diff.value;
			}
		}
		const coverUrl =
			coverProposed && !unchecked.has("cover") ? selected.coverUrl : undefined;
		onApply(fields, coverUrl);
		setSelected(null);
	};

	const pick = (candidate: MetadataCandidate) => {
		setSelected(candidate);
		setUnchecked(new Set());
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2">
				<button
					type="button"
					className="btn btn-ghost text-xs"
					disabled={isSearching}
					onClick={() => void search()}
				>
					<Icon name="search" size={13} />
					{isSearching ? "Searching…" : "Search online"}
				</button>
				<span className="text-xs text-[var(--muted-2)]">
					Open Library + Google Books; nothing changes until you apply and save.
				</span>
			</div>
			{error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}

			{!selected && candidates.length > 0 ? (
				<div className="flex max-h-56 flex-col gap-1 overflow-auto">
					{candidates.map((candidate, index) => (
						<button
							type="button"
							// biome-ignore lint/suspicious/noArrayIndexKey: candidates have no stable id and the list is replaced wholesale per search
							key={`${candidate.source}-${index}`}
							className="menu-item flex items-center gap-3"
							onClick={() => pick(candidate)}
						>
							<span className="h-14 w-9 shrink-0 overflow-hidden rounded-sm bg-[var(--surface-3)]">
								{candidate.coverUrl ? (
									<img
										src={candidate.coverUrl}
										alt=""
										loading="lazy"
										className="h-full w-full object-cover"
									/>
								) : null}
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm text-[var(--ink)]">
									{candidate.title}
								</span>
								<span className="block truncate text-xs text-[var(--muted)]">
									{candidate.author ?? "Unknown author"}
								</span>
							</span>
							<span className="shrink-0 text-[11px] text-[var(--muted-2)]">
								{SOURCE_LABELS[candidate.source]}
							</span>
						</button>
					))}
				</div>
			) : null}

			{selected ? (
				<div className="flex flex-col gap-2">
					<div className="flex items-center justify-between">
						<span className="text-xs text-[var(--muted)]">
							{`From ${SOURCE_LABELS[selected.source]}`}
							{selectedSourceHref ? (
								<a
									className="ml-2 inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
									href={selectedSourceHref}
									target="_blank"
									rel="noreferrer"
								>
									<Icon name="external-link" size={11} />
									view
								</a>
							) : null}
						</span>
						<button
							type="button"
							className="chip"
							onClick={() => setSelected(null)}
						>
							Back to results
						</button>
					</div>
					{diffs.length === 0 && !coverProposed ? (
						<p className="text-xs text-[var(--muted-2)]">
							This match proposes no changes.
						</p>
					) : (
						<div className="flex flex-col gap-1">
							{diffs.map((diff) => (
								<label
									key={diff.field}
									className="surface-soft flex cursor-pointer items-start gap-2 p-2 text-xs"
								>
									<input
										type="checkbox"
										className="mt-0.5"
										checked={!unchecked.has(diff.field)}
										onChange={() => toggle(diff.field)}
									/>
									<span className="min-w-0 flex-1">
										<span className="block text-[var(--muted-2)]">
											{diff.label}
										</span>
										{diff.current ? (
											<span className="block truncate text-[var(--muted)] line-through">
												{diff.current}
											</span>
										) : null}
										<span className="block text-[var(--ink)]">
											{diff.proposed}
										</span>
									</span>
								</label>
							))}
							{coverProposed && selected.coverUrl ? (
								<label className="surface-soft flex cursor-pointer items-center gap-2 p-2 text-xs">
									<input
										type="checkbox"
										checked={!unchecked.has("cover")}
										onChange={() => toggle("cover")}
									/>
									<span className="text-[var(--muted-2)]">Cover</span>
									<img
										src={selected.coverUrl}
										alt=""
										className="h-14 w-9 rounded-sm object-cover"
									/>
								</label>
							) : null}
							<button
								type="button"
								className="btn btn-primary mt-1 self-start text-xs"
								onClick={apply}
							>
								Apply selected
							</button>
						</div>
					)}
				</div>
			) : null}
		</div>
	);
};
