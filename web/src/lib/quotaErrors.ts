import { ConvexError } from "convex/values";

// The app's one byte formatter. Whole-MB floor: sub-MB precision reads as
// jitter (storage estimates wobble at KB granularity), so everything under
// a megabyte is just "< 1 MB".
export const formatStorage = (bytes: number): string => {
	if (bytes >= 1024 ** 3) {
		return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
	}
	if (bytes >= 1024 ** 2) {
		return `${Math.round(bytes / 1024 ** 2)} MB`;
	}
	return "< 1 MB";
};

// Client twin of MAX_COVER_BYTES in convex/quota.ts (server code can't be
// imported into the browser bundle) — keep the two in step. The pre-check
// in uploadBookAsset uses this to refuse an oversized cover BEFORE the PUT:
// the R2 cover key is fixed, so an upload the server would reject has
// already destroyed the previous cover by the time the server sees it.
export const MAX_COVER_BYTES = 10 * 1024 * 1024;

export const COVER_TOO_LARGE_MESSAGE =
	"That cover image is too large (10 MB max).";

type QuotaErrorData = {
	code?: string;
	usedBytes?: number;
	limitBytes?: number;
};

export const isQuotaExceededError = (err: unknown): boolean =>
	err instanceof ConvexError &&
	(err.data as QuotaErrorData | undefined)?.code === "quota_exceeded";

/**
 * Map server-side quota/billing ConvexErrors to user-facing copy. Returns
 * null for anything else so callers fall through to their generic handling.
 * `attemptedBytes` (when the caller knows the upload's size) distinguishes
 * "storage is full" from "this file can never fit" — the remediation
 * advice differs.
 */
export const quotaErrorMessage = (
	err: unknown,
	attemptedBytes?: number,
): string | null => {
	if (!(err instanceof ConvexError)) {
		return null;
	}
	const data = err.data as QuotaErrorData | undefined;
	switch (data?.code) {
		case "quota_exceeded": {
			if (
				typeof attemptedBytes === "number" &&
				typeof data.limitBytes === "number" &&
				attemptedBytes > data.limitBytes
			) {
				return `This book (${formatStorage(attemptedBytes)}) is larger than the whole cloud allowance (${formatStorage(data.limitBytes)}), so it can't be backed up. Your existing books are unaffected.`;
			}
			const detail =
				typeof data.usedBytes === "number" &&
				typeof data.limitBytes === "number"
					? ` (${formatStorage(data.usedBytes)} of ${formatStorage(data.limitBytes)} used)`
					: "";
			return `Cloud storage is full${detail}. Free up space by deleting books, or become a supporter for more room. Your existing books are unaffected.`;
		}
		case "cover_too_large":
			return COVER_TOO_LARGE_MESSAGE;
		case "update_required":
			return "Please reload Librium to finish this import.";
		default:
			return null;
	}
};
