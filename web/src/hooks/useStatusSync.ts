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
	useEffect(() => {
		if (!remote || !local) {
			return;
		}
		const localByBook = new Map(local.map((row) => [row.bookId, row]));
		void (async () => {
			for (const entry of remote) {
				const row = localByBook.get(entry.bookId);
				if (row?.dirty) {
					continue;
				}
				if (row && entry.updatedAt <= row.syncedServerTime) {
					continue;
				}
				// No row + no explicit status = nothing to record; keeps the table
				// sparse. (A remote *clear* still lands because the stale explicit
				// value exists as a local row.)
				if (!row && entry.status === null) {
					continue;
				}
				await db.bookStatus.put({
					bookId: entry.bookId,
					status: entry.status,
					editedAt: entry.statusEditedAt ?? 0,
					dirty: 0,
					syncedServerTime: entry.updatedAt,
				});
			}
		})().catch(() => {
			// IndexedDB unavailable — the in-memory view below still works.
		});
	}, [remote, local]);

	// Push pass: send dirty rows (fires on edit and on reconnect).
	const pushingRef = useRef(false);
	useEffect(() => {
		if (!canQuery || !local || pushingRef.current) {
			return;
		}
		const dirtyRows = local.filter((row) => row.dirty);
		if (dirtyRows.length === 0) {
			return;
		}
		pushingRef.current = true;
		void (async () => {
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
		})().finally(() => {
			pushingRef.current = false;
		});
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
