import { useMutation, useQuery } from "convex/react";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { api } from "../../convex/_generated/api";
import { db } from "../lib/db";
import type { ReadingStatus } from "../lib/status";

// Local-first reading status with LWW sync — the batched, library-wide
// sibling of useProgressSync (same rules, own clock):
// - setStatus writes IndexedDB first (instant, offline-capable), marked dirty.
// - Dirty rows push when a connection exists; the server rejects pushes older
//   (by statusEditedAt) than what it holds, so a reconnecting device cannot
//   clobber a newer choice made elsewhere.
// - Pull ordering compares server clocks only: a remote value is adopted when
//   its updatedAt is newer than the last server state merged here
//   (syncedServerTime) — and never over an unpushed local edit.

type UseStatusSyncArgs = {
	canQuery: boolean;
};

export function useStatusSync({ canQuery }: UseStatusSyncArgs) {
	const updateStatus = useMutation(api.userBooks.updateStatus);
	const remote = useQuery(api.userBooks.listByUser, canQuery ? {} : "skip");
	const local = useLiveQuery(() => db.bookStatus.toArray(), []);

	// Merge pass: adopt newer remote state into IndexedDB so it survives going
	// offline. userBooks.updatedAt also bumps on progress writes, so some
	// adoptions rewrite an unchanged status — harmless, and it keeps the exact
	// pull-ordering rule progress sync uses.
	//
	// Each row's check+write runs in one transaction against the LIVE row, and
	// passes serialize on a queue — a setStatus (dirty:1) landing mid-pass must
	// not be clobbered back to dirty:0 by a decision made from a stale snapshot.
	const mergeQueueRef = useRef<Promise<void>>(Promise.resolve());
	useEffect(() => {
		if (!remote || !local) {
			return;
		}
		const entries = remote.map((entry) => ({
			bookId: entry.bookId,
			status: entry.status,
			statusEditedAt: entry.statusEditedAt ?? 0,
			updatedAt: entry.updatedAt,
		}));
		const mergePass = async () => {
			for (const entry of entries) {
				await db.transaction("rw", db.bookStatus, async () => {
					const live = await db.bookStatus.get(entry.bookId);
					// Unpushed local edit — never overwrite it.
					if (live?.dirty) {
						return;
					}
					if (live && entry.updatedAt <= live.syncedServerTime) {
						return;
					}
					// No row + no explicit status = nothing to record; keeps the table
					// sparse. (A remote *clear* still lands because the stale explicit
					// value exists as a local row.)
					if (!live && entry.status === null) {
						return;
					}
					await db.bookStatus.put({
						bookId: entry.bookId,
						status: entry.status,
						editedAt: entry.statusEditedAt,
						dirty: 0,
						syncedServerTime: entry.updatedAt,
					});
				});
			}
		};
		mergeQueueRef.current = mergeQueueRef.current.then(mergePass).catch(() => {
			// IndexedDB unavailable — the in-memory view below still works.
		});
	}, [remote, local]);

	// Push pass: send dirty rows (fires on edit and on reconnect). Passes
	// serialize on a promise queue — a liveQuery emission landing mid-pass
	// (e.g. bulk "Mark as" writing row N while row 1 pushes) enqueues another
	// pass instead of being dropped; each pass re-reads dirty rows from Dexie.
	const pushQueueRef = useRef<Promise<void>>(Promise.resolve());
	useEffect(() => {
		if (!canQuery || !local?.some((row) => row.dirty)) {
			return;
		}
		const pushPass = async () => {
			const dirtyRows = await db.bookStatus
				.filter((row) => row.dirty === 1)
				.toArray();
			for (const row of dirtyRows) {
				const editedAt = row.editedAt;
				try {
					await updateStatus({
						bookId: row.bookId as never,
						status: row.status,
						editedAt,
					});
					await db.bookStatus
						.where("bookId")
						.equals(row.bookId)
						.modify((r) => {
							// Only clear dirty if no newer local edit happened meanwhile.
							if (r.editedAt <= editedAt) {
								r.dirty = 0;
							}
						});
				} catch {
					// Offline or transient — retried on the next edit or reconnect.
				}
			}
		};
		pushQueueRef.current = pushQueueRef.current.then(pushPass).catch(() => {});
	}, [canQuery, local, updateStatus]);

	// Effective explicit-status view: remote is authoritative except where an
	// unpushed local edit exists; offline, local rows are the source.
	const statusByBookId = useMemo(() => {
		const map = new Map<string, ReadingStatus | null>();
		if (remote) {
			for (const entry of remote) {
				map.set(entry.bookId, entry.status);
			}
		} else {
			for (const row of local ?? []) {
				map.set(row.bookId, row.status);
			}
		}
		for (const row of local ?? []) {
			if (row.dirty) {
				map.set(row.bookId, row.status);
			}
		}
		return map;
	}, [remote, local]);

	const setStatus = useCallback(
		async (bookId: string, status: ReadingStatus | null) => {
			try {
				const existing = await db.bookStatus.get(bookId);
				await db.bookStatus.put({
					bookId,
					status,
					editedAt: Date.now(),
					dirty: 1,
					syncedServerTime: existing?.syncedServerTime ?? 0,
				});
			} catch {
				// IndexedDB unavailable — nothing durable to write.
			}
		},
		[],
	);

	return { statusByBookId, setStatus };
}
