import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { getViewerUserId } from "./authHelpers";
import { getPlan, isBillingConfigured, type Plan } from "./billing";

// Cloud-storage quota plane. The free tier gets a fixed allowance of stored
// EPUB bytes; supporters (Polar subscription) get a bigger one. Design rules,
// in order of importance:
//
//   1. NEVER harm existing data. Quota gates NEW uploads only — sync,
//      seeding, reading, export, and metadata edits are never quota-checked,
//      and a downgrade (or over-limit state) leaves every existing book
//      readable and exportable on every device.
//   2. The authority is the VERIFIED size in R2, not what the client claims.
//      registerImport's check on the declared size is a fast-fail courtesy;
//      finalizeUpload (books.ts) re-checks with the size R2 reports after
//      the upload, inside a mutation (serializable, so concurrent imports
//      can't race past the limit together).
//   3. Fail open on billing lookups: if the subscription read errors, treat
//      the user as free — never block reads, never grant paid limits by
//      accident.
//
// Enforcement is off until QUOTA_ENFORCED is set on the deployment, so this
// code can ship (and the frontend can deploy) before the Polar org exists.

const MB = 1024 * 1024;

const envInt = (name: string, fallback: number): number => {
	const raw = process.env[name];
	if (!raw) {
		return fallback;
	}
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const quotaEnforced = (): boolean => {
	const raw = process.env.QUOTA_ENFORCED;
	return raw === "1" || raw === "true";
};

export const limitBytesForPlan = (plan: Plan): number =>
	plan === "supporter"
		? envInt("SUPPORTER_QUOTA_MB", 10 * 1024) * MB
		: envInt("FREE_QUOTA_MB", 250) * MB;

// Covers live outside the byte quota (fixed key per book, so they're bounded
// by count), but each upload gets a hard sanity cap so the cover key can't be
// used as a free storage side channel.
export const MAX_COVER_BYTES = 10 * MB;

/**
 * Bytes actually stored: sum of fileSize over books whose EPUB is attached.
 * Rows without epubKey are metadata-only (upload pending or failed) and
 * don't hold R2 storage. `excludeBookId` lets finalize re-attach a book
 * without double-counting itself.
 */
export const attachedUsageBytes = async (
	ctx: QueryCtx | MutationCtx,
	ownerId: Id<"users">,
	excludeBookId?: Id<"books">,
): Promise<number> => {
	const books = await ctx.db
		.query("books")
		.withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
		.collect();
	let total = 0;
	for (const book of books) {
		if (book._id === excludeBookId || !book.epubKey) {
			continue;
		}
		total += book.fileSize ?? 0;
	}
	return total;
};

/** Plan + resolved limit in one read — for callers that need the numbers. */
export const getPlanAndLimit = async (
	ctx: QueryCtx | MutationCtx,
	ownerId: Id<"users">,
): Promise<{ enforced: boolean; plan: Plan; limitBytes: number }> => {
	const plan = await getPlan(ctx, ownerId);
	return {
		enforced: quotaEnforced(),
		plan,
		limitBytes: limitBytesForPlan(plan),
	};
};

export const quotaExceededError = (usedBytes: number, limitBytes: number) =>
	new ConvexError({
		code: "quota_exceeded" as const,
		usedBytes,
		limitBytes,
	});

/**
 * Throw quota_exceeded if adding `addBytes` would push the owner past their
 * plan's limit. No-op while enforcement is off. Callers run this inside a
 * mutation so the usage read and the write commit atomically.
 */
export const assertWithinQuota = async (
	ctx: QueryCtx | MutationCtx,
	ownerId: Id<"users">,
	addBytes: number,
	excludeBookId?: Id<"books">,
): Promise<void> => {
	if (!quotaEnforced()) {
		return;
	}
	const plan = await getPlan(ctx, ownerId);
	const limit = limitBytesForPlan(plan);
	const used = await attachedUsageBytes(ctx, ownerId, excludeBookId);
	if (used + addBytes > limit) {
		throw quotaExceededError(used, limit);
	}
};

/** Storage panel data: usage, limit, and plan for the signed-in user. */
export const getStorage = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getViewerUserId(ctx);
		if (!userId) {
			return null;
		}
		const enforced = quotaEnforced();
		const plan = await getPlan(ctx, userId);
		return {
			usedBytes: await attachedUsageBytes(ctx, userId),
			limitBytes: enforced ? limitBytesForPlan(plan) : null,
			plan,
			enforced,
			billingConfigured: isBillingConfigured(),
		};
	},
});
