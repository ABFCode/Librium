/**
 * Per-record sync versions must advance strictly even when two Convex
 * mutations run inside the same wall-clock millisecond. Device clocks never
 * participate; `now` is injectable only for deterministic tests.
 */
export const nextServerVersion = (current: number, now = Date.now()) =>
	Math.max(now, current + 1);

/** Missing bases come from old/stale clients and are the oldest possible view. */
export const observedServerVersion = (base: number | undefined) => base ?? 0;
