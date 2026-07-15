import { useConvex } from "convex/react";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "../lib/db";
import { uploadBookAsset } from "../lib/uploadBookAsset";

export function usePendingUploadSync(canSync: boolean) {
	const convex = useConvex();
	const pending = useLiveQuery(() => db.pendingUploads.toArray(), []);
	const attemptedRef = useRef(new Set<string>());
	const runningRef = useRef(false);
	const [isRetrying, setIsRetrying] = useState(false);
	const [lastError, setLastError] = useState<string | null>(null);

	const run = useCallback(
		async (force = false) => {
			if (!canSync || !pending || runningRef.current) {
				return;
			}
			if (force) {
				attemptedRef.current.clear();
			}
			const targets = pending.filter(
				(row) => !attemptedRef.current.has(row.bookId),
			);
			if (targets.length === 0) {
				return;
			}
			runningRef.current = true;
			setIsRetrying(true);
			setLastError(null);
			try {
				for (const row of targets) {
					attemptedRef.current.add(row.bookId);
					try {
						await uploadBookAsset(convex, row.bookId, "epub", row.blob);
						await db.pendingUploads.delete(row.bookId);
					} catch (error) {
						const message =
							error instanceof Error ? error.message : "Cloud backup failed";
						await db.pendingUploads.update(row.bookId, {
							lastError: message,
							updatedAt: Date.now(),
						});
						setLastError(message);
					}
				}
			} finally {
				runningRef.current = false;
				setIsRetrying(false);
			}
		},
		[canSync, convex, pending],
	);

	// One attempt when a pending row first appears in this mounted library.
	useEffect(() => {
		void run();
	}, [run]);

	// A real network transition is a fresh opportunity, independent of React
	// query emissions (which may stay authenticated while the socket reconnects).
	useEffect(() => {
		const handleOnline = () => void run(true);
		window.addEventListener("online", handleOnline);
		return () => window.removeEventListener("online", handleOnline);
	}, [run]);

	return {
		pendingCount: pending?.length ?? 0,
		isRetrying,
		lastError,
		retryAll: () => run(true),
	};
}
