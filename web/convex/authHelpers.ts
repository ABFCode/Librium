import type { Id } from "convex/values";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";

type Ctx = MutationCtx | QueryCtx | ActionCtx;

const deploymentName = process.env.CONVEX_DEPLOYMENT ?? "";
const convexUrl = process.env.CONVEX_URL ?? process.env.CONVEX_SITE_URL ?? "";
const isLocalDeployment =
  deploymentName.startsWith("local") ||
  deploymentName.startsWith("anonymous") ||
  deploymentName.includes("local") ||
  deploymentName.includes("anonymous");
const isLocalConvex =
  convexUrl.includes("127.0.0.1") || convexUrl.includes("localhost");

const allowLocalAuth =
  process.env.ALLOW_LOCAL_AUTH === "true" ||
  process.env.VITE_ALLOW_LOCAL_AUTH === "true" ||
  isLocalDeployment ||
  isLocalConvex;

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

const ensureLocalDevUser = async (ctx: Ctx, allowCreate: boolean) => {
  if (!canRead(ctx)) {
    return null;
  }
  const existing = await ctx.db
    .query("users")
    .withIndex("by_external_id", (q) =>
      q.eq("authProvider", "local").eq("externalId", "local-dev"),
    )
    .first();

  if (existing) {
    return existing._id;
  }

  if (!allowCreate || !canWrite(ctx)) {
    return null;
  }

  return await ctx.db.insert("users", {
    authProvider: "local",
    externalId: "local-dev",
    name: "Local Dev",
    createdAt: Date.now(),
  });
};

export const getViewerUserId = async (ctx: Ctx) => {
  if (!canRead(ctx)) {
    return null;
  }
  const identity = await ctx.auth.getUserIdentity();
  if (identity) {
    const resolved = resolveIdentity(identity);
    if (!resolved.externalId) {
      return null;
    }
    const existing = await ctx.db
      .query("users")
      .withIndex("by_external_id", (q) =>
        q.eq("authProvider", "better-auth").eq("externalId", resolved.externalId!),
      )
      .first();

    if (existing) {
      if ((resolved.email || resolved.name) && canWrite(ctx)) {
        await ctx.db.patch(existing._id, {
          email: resolved.email ?? existing.email,
          name: resolved.name ?? existing.name,
        });
      }
      return existing._id;
    }
    if (canWrite(ctx)) {
      return await ctx.db.insert("users", {
        authProvider: "better-auth",
        externalId: resolved.externalId,
        email: resolved.email ?? undefined,
        name: resolved.name ?? undefined,
        createdAt: Date.now(),
      });
    }
  }

  if (allowLocalAuth) {
    return await ensureLocalDevUser(ctx, canWrite(ctx));
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
  const book = await ctx.db.get(bookId);
  if (!book) {
    throw new Error("Book not found.");
  }
  if (book.ownerId !== viewerId) {
    throw new Error("Not authorized to access this book.");
  }
  return { viewerId, book };
};


export const requireSectionOwner = async (
  ctx: Ctx,
  sectionId: Id<"sections">,
) => {
  const section = await ctx.db.get(sectionId);
  if (!section) {
    throw new Error("Section not found.");
  }
  const { viewerId, book } = await requireBookOwner(ctx, section.bookId);
  return { viewerId, book, section };
};
