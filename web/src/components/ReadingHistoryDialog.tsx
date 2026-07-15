import { useMutation, useQuery } from "convex/react";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import { db } from "../lib/db";
import {
	getSyncDeviceInfo,
	type SyncDeviceKind,
	syncDeviceLabel,
} from "../lib/syncDevice";
import { Modal } from "./Modal";

type ReadingHistoryDialogProps = {
	bookId: string;
	bookTitle: string;
	canQuery: boolean;
	onClose: () => void;
};

type Position = {
	sectionIndex: number;
	blockIndex?: number;
	blockOffset?: number;
	sectionFraction?: number;
};

const samePosition = (a: Position, b: Position) =>
	a.sectionIndex === b.sectionIndex &&
	(a.blockIndex ?? 0) === (b.blockIndex ?? 0) &&
	(a.blockOffset ?? 0) === (b.blockOffset ?? 0) &&
	(a.sectionFraction ?? 0) === (b.sectionFraction ?? 0);

const formatTimestamp = (value: number) =>
	new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));

export function ReadingHistoryDialog({
	bookId,
	bookTitle,
	canQuery,
	onClose,
}: ReadingHistoryDialogProps) {
	const historyDb = db;
	const device = useMemo(() => getSyncDeviceInfo(), []);
	const recovery = useQuery(
		api.userBooks.listProgressHistory,
		canQuery ? { bookId: bookId as never } : "skip",
	);
	const restoreProgress = useMutation(api.userBooks.restoreProgress);
	const localSections = useLiveQuery(
		() =>
			historyDb.sections.where("bookId").equals(bookId).sortBy("orderIndex"),
		[bookId],
	);
	const [isOnline, setIsOnline] = useState(() => navigator.onLine);
	const [restoringId, setRestoringId] = useState<string | null>(null);
	const [notice, setNotice] = useState<{
		kind: "success" | "error";
		message: string;
	} | null>(null);

	useEffect(() => {
		const handleOnline = () => setIsOnline(true);
		const handleOffline = () => setIsOnline(false);
		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);
		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, []);

	const titleBySection = useMemo(
		() =>
			new Map(
				(localSections ?? []).map((section) => [
					section.orderIndex,
					section.title,
				]),
			),
		[localSections],
	);
	const describePosition = (position: Position) => {
		const fallback = `Chapter ${position.sectionIndex + 1}`;
		return {
			title: titleBySection.get(position.sectionIndex) || fallback,
			chapter: fallback,
			fraction: Math.round((position.sectionFraction ?? 0) * 100),
		};
	};
	const earlierPositions =
		recovery?.current === undefined || recovery.current === null
			? []
			: recovery.history.filter(
					(checkpoint) =>
						!samePosition(checkpoint, recovery.current as Position),
				);

	const restore = async (
		checkpoint: NonNullable<typeof recovery>["history"][number],
	) => {
		if (!recovery?.current || !isOnline || restoringId) return;
		setRestoringId(checkpoint._id);
		setNotice(null);
		try {
			const result = await restoreProgress({
				bookId: bookId as never,
				historyId: checkpoint._id,
				baseServerTime: recovery.current.serverTime,
				deviceId: device.id,
				deviceKind: device.kind,
			});
			if (!result.accepted) {
				setNotice({
					kind: "error",
					message:
						"Your reading position changed on another device. History has been refreshed; review it and try again.",
				});
				return;
			}
			await historyDb.progress.put({
				bookId,
				sectionIndex: result.lastSectionIndex,
				blockIndex: result.lastBlockIndex ?? 0,
				blockOffset: result.lastBlockOffset ?? 0,
				sectionFraction: result.lastSectionFraction ?? 0,
				editedAt: result.serverTime,
				dirty: 0,
				syncedServerTime: result.serverTime,
			});
			const position = describePosition({
				sectionIndex: result.lastSectionIndex,
				blockIndex: result.lastBlockIndex,
				blockOffset: result.lastBlockOffset,
				sectionFraction: result.lastSectionFraction,
			});
			setNotice({
				kind: "success",
				message: `${position.title} restored. The position it replaced is still available below.`,
			});
		} catch (error) {
			setNotice({
				kind: "error",
				message:
					error instanceof Error
						? error.message
						: "Unable to restore that position. Try again when connected.",
			});
		} finally {
			setRestoringId(null);
		}
	};

	return (
		<Modal
			label="Reading history"
			onClose={onClose}
			panelClassName="surface flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-lg flex-col overflow-hidden"
			backdropClassName="px-4"
		>
			<div className="flex items-start justify-between gap-4 border-b border-[var(--outline)] px-5 py-4">
				<div className="min-w-0">
					<h2 className="text-xl">Reading history</h2>
					<p className="mt-1 truncate text-sm text-[var(--muted)]">
						{bookTitle}
					</p>
				</div>
				<button
					type="button"
					className="btn btn-ghost shrink-0 text-xs"
					onClick={onClose}
				>
					Close
				</button>
			</div>

			<div className="reader-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
				<p className="mb-4 text-sm leading-relaxed text-[var(--muted)]">
					Restoring creates a new synced position and first saves the place it
					replaces, so you can safely change your mind.
				</p>
				{notice ? (
					<div
						role="status"
						className={`mb-4 rounded-[var(--radius-sm)] border px-3 py-2 text-sm ${
							notice.kind === "success"
								? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
								: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
						}`}
					>
						{notice.message}
					</div>
				) : null}
				{!isOnline ? (
					<div className="surface-soft mb-4 px-3 py-2 text-sm text-[var(--muted)]">
						You’re offline. Saved history remains protected in your account, but
						restoring requires a connection.
					</div>
				) : null}

				{!canQuery ? (
					<p className="text-sm text-[var(--muted)]">
						Sign in to view synchronized reading history.
					</p>
				) : recovery === undefined ? (
					<div
						role="status"
						className="py-8 text-center text-sm text-[var(--muted)]"
					>
						Loading reading history…
					</div>
				) : !recovery.current ? (
					<div className="surface-soft px-4 py-5 text-sm text-[var(--muted)]">
						No synchronized reading position exists yet. History begins as you
						move through the book.
					</div>
				) : (
					<>
						{(() => {
							const current = describePosition(recovery.current);
							return (
								<section aria-label="Current reading position" className="mb-5">
									<div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-2)]">
										Current position
									</div>
									<div className="surface-soft px-4 py-3">
										<div className="font-medium text-[var(--ink)]">
											{current.title}
										</div>
										<div className="mt-1 text-xs text-[var(--muted)]">
											{`${current.chapter} · ${current.fraction}% through chapter · ${syncDeviceLabel(
												recovery.current.deviceKind as
													| SyncDeviceKind
													| undefined,
											)}`}
										</div>
									</div>
								</section>
							);
						})()}

						<section aria-label="Earlier reading positions">
							<div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-2)]">
								Earlier positions
							</div>
							{earlierPositions.length === 0 ? (
								<p className="surface-soft px-4 py-4 text-sm text-[var(--muted)]">
									No earlier positions yet. Chapter changes and meaningful
									movement within long chapters create recovery points
									automatically.
								</p>
							) : (
								<div className="flex flex-col gap-2">
									{earlierPositions.map((checkpoint) => {
										const position = describePosition(checkpoint);
										return (
											<div
												key={checkpoint._id}
												data-history-section={checkpoint.sectionIndex}
												className="surface-soft flex items-center gap-3 px-4 py-3"
											>
												<div className="min-w-0 flex-1">
													<div className="truncate font-medium text-[var(--ink)]">
														{position.title}
													</div>
													<div className="mt-1 text-xs text-[var(--muted)]">
														{`${position.chapter} · ${position.fraction}% · ${syncDeviceLabel(
															checkpoint.deviceKind as
																| SyncDeviceKind
																| undefined,
														)}`}
													</div>
													<div className="mt-1 text-[11px] text-[var(--muted-2)]">
														{checkpoint.cause === "restore"
															? `Saved before a restore · ${formatTimestamp(checkpoint.recordedAt)}`
															: checkpoint.largeBackwardJump
																? `Protected before a large backward jump · ${formatTimestamp(checkpoint.recordedAt)}`
																: formatTimestamp(checkpoint.recordedAt)}
													</div>
												</div>
												<button
													type="button"
													className="btn btn-ghost shrink-0 text-xs"
													disabled={!isOnline || restoringId !== null}
													onClick={() => void restore(checkpoint)}
												>
													{restoringId === checkpoint._id
														? "Restoring…"
														: "Restore"}
												</button>
											</div>
										);
									})}
								</div>
							)}
						</section>
					</>
				)}
			</div>
		</Modal>
	);
}
