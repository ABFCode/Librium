import type { Id } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";

type Ctx = MutationCtx | QueryCtx;

const allowLocalAuth =
  process.env.ALLOW_LOCAL_AUTH === "true" ||
  process.env.VITE_ALLOW_LOCAL_AUTH === "true";

const allowServerImports =
  process.env.ALLOW_SERVER_IMPORTS === "true" ||
  process.env.NODE_ENV !== "production";

const resolveExternalId = (authUser: Record<string, unknown>) => {
  const id =
    (authUser as { id?: string }).id ||
    (authUser as { userId?: string }).userId ||
    (authUser as { sub?: string }).sub;
  return id ?? "unknown";
};

const ensureLocalDevUser = async (ctx: Ctx) => {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_external_id", (q) =>
      q.eq("authProvider", "local").eq("externalId", "local-dev"),
    )
    .first();

  if (existing) {
    return existing._id;
  }

  return await ctx.db.insert("users", {
    authProvider: "local",
    externalId: "local-dev",
    name: "Local Dev",
    createdAt: Date.now(),
  });
};

export const getViewerUserId = async (ctx: Ctx) => {
  try {
    const authUser = await authComponent.getAuthUser(ctx);
    if (authUser) {
      const externalId = resolveExternalId(authUser);
      const existing = await ctx.db
        .query("users")
        .withIndex("by_external_id", (q) =>
          q.eq("authProvider", "better-auth").eq("externalId", externalId),
        )
        .first();

      if (existing) {
        if (authUser.email || authUser.name) {
          await ctx.db.patch(existing._id, {
            email: authUser.email ?? existing.email,
            name: authUser.name ?? existing.name,
          });
        }
        return existing._id;
      }

      return await ctx.db.insert("users", {
        authProvider: "better-auth",
        externalId,
        email: authUser.email ?? undefined,
        name: authUser.name ?? undefined,
        createdAt: Date.now(),
      });
    }
  } catch {
    // Ignore auth resolution errors.
  }

  if (allowLocalAuth) {
    return await ensureLocalDevUser(ctx);
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

export const resolveImportUserId = async (
  ctx: Ctx,
  providedUserId?: Id<"users">,
) => {
  const viewerId = await getViewerUserId(ctx);
  if (viewerId) {
    if (providedUserId && providedUserId !== viewerId) {
      throw new Error("Not authorized to import for another user.");
    }
    return viewerId;
  }
  if (!allowServerImports && !allowLocalAuth) {
    throw new Error("Unauthenticated");
  }
  if (!providedUserId) {
    return await ensureLocalDevUser(ctx);
  }
  if (allowLocalAuth) {
    const local = await ctx.db.get(providedUserId);
    if (
      !local ||
      local.authProvider !== "local" ||
      local.externalId !== "local-dev"
    ) {
      throw new Error("Not authorized to import for another user.");
    }
  }
  return providedUserId;
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

export const requireBookOwnerOrImporter = async (
  ctx: Ctx,
  bookId: Id<"books">,
) => {
  const book = await ctx.db.get(bookId);
  if (!book) {
    throw new Error("Book not found.");
  }
  const userId = await resolveImportUserId(ctx, book.ownerId);
  if (book.ownerId !== userId) {
    throw new Error("Not authorized to access this book.");
  }
  return { userId, book };
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

export const requireImportJobOwnerOrImporter = async (
  ctx: Ctx,
  importJobId: Id<"importJobs">,
) => {
  const job = await ctx.db.get(importJobId);
  if (!job) {
    throw new Error("Import job not found.");
  }
  const userId = await resolveImportUserId(ctx, job.userId);
  if (job.userId !== userId) {
    throw new Error("Not authorized to access this import job.");
  }
  return { userId, job };
};
