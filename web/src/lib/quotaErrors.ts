import { ConvexError } from "convex/values";

export const formatStorage = (bytes: number): string => {
	if (bytes >= 1024 ** 3) {
		return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
	}
	if (bytes >= 1024 ** 2) {
		return `${Math.round(bytes / 1024 ** 2)} MB`;
	}
	return "< 1 MB";
};

type QuotaErrorData = {
	code?: string;
	usedBytes?: number;
	limitBytes?: number;
};

/**
 * Map server-side quota/billing ConvexErrors to user-facing copy. Returns
 * null for anything else so callers fall through to their generic handling.
 */
export const quotaErrorMessage = (err: unknown): string | null => {
	if (!(err instanceof ConvexError)) {
		return null;
	}
	const data = err.data as QuotaErrorData | undefined;
	switch (data?.code) {
		case "quota_exceeded": {
			const detail =
				typeof data.usedBytes === "number" &&
				typeof data.limitBytes === "number"
					? ` (${formatStorage(data.usedBytes)} of ${formatStorage(data.limitBytes)} used)`
					: "";
			return `Cloud storage is full${detail}. Free up space by deleting books, or become a supporter for more room. Your existing books are unaffected.`;
		}
		case "cover_too_large":
			return "That cover image is too large (10 MB max).";
		case "update_required":
			return "Please reload Librium to finish this import.";
		default:
			return null;
	}
};
