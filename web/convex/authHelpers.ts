import type { Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";

type Ctx = MutationCtx | QueryCtx | ActionCtx;

// The canRead/canWrite guards below establish at runtime that ctx has a db,
// but TypeScript can't narrow a union on a probed property — this cast is
// the typed counterpart of those guards.
const dbOf = (ctx: Ctx) => (ctx as MutationCtx).db;

const resolveIdentity = (identity: {
	subject?: string | null;
	tokenIdentifier?: string | null;
	email?: string | null;
	name?: string | null;
}) => {
	const externalId =
		identity.subject ?? identity.tokenIdentifier ?? identity.email ?? null;
	return {
		externalId,
		email: identity.email ?? undefined,
		name: identity.name ?? undefined,
	};
};

const canWrite = (ctx: Ctx) =>
	typeof (ctx as { db?: { insert?: unknown } }).db?.insert === "function";
const canRead = (ctx: Ctx) =>
	typeof (ctx as { db?: { get?: unknown } }).db?.get === "function";

export const getViewerUserId = async (ctx: Ctx) => {
	if (!canRead(ctx)) {
		return null;
	}
	const identity = await ctx.auth.getUserIdentity();
	if (identity) {
		const resolved = resolveIdentity(identity);
		const externalId = resolved.externalId;
		if (!externalId) {
			return null;
		}
		const existing = await dbOf(ctx)
			.query("users")
			.withIndex("by_external_id", (q) =>
				q.eq("authProvider", "better-auth").eq("externalId", externalId),
			)
			.first();

		if (existing) {
			if ((resolved.email || resolved.name) && canWrite(ctx)) {
				await dbOf(ctx).patch(existing._id, {
					email: resolved.email ?? existing.email,
					name: resolved.name ?? existing.name,
				});
			}
			return existing._id;
		}
		if (canWrite(ctx)) {
			return await dbOf(ctx).insert("users", {
				authProvider: "better-auth",
				externalId,
				email: resolved.email ?? undefined,
				name: resolved.name ?? undefined,
				createdAt: Date.now(),
			});
		}
	}

	return null;
};

export const requireViewerUserId = async (ctx: Ctx) => {
	const userId = await getViewerUserId(ctx);
	if (!userId) {
		throw new Error("Unauthenticated");
	}
	return userId;
};

export const requireBookOwner = async (ctx: Ctx, bookId: Id<"books">) => {
	const viewerId = await requireViewerUserId(ctx);
	const book = await dbOf(ctx).get(bookId);
	if (!book) {
		throw new Error("Book not found.");
	}
	if (book.ownerId !== viewerId) {
		throw new Error("Not authorized to access this book.");
	}
	return { viewerId, book };
};
