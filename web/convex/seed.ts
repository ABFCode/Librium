import { internalMutation, action } from "./_generated/server";
import { v } from "convex/values";

const deploymentName = process.env.CONVEX_DEPLOYMENT ?? "";
const convexUrl = process.env.CONVEX_URL ?? process.env.CONVEX_SITE_URL ?? "";
const isLocalDeployment =
  deploymentName.startsWith("local") ||
  deploymentName.startsWith("anonymous") ||
  deploymentName.includes("local") ||
  deploymentName.includes("anonymous");
const isLocalConvex =
  convexUrl.includes("127.0.0.1") || convexUrl.includes("localhost");
const allowSeed =
  process.env.ALLOW_SEED === "true" || isLocalDeployment || isLocalConvex;

export const createDemoBookInternal = internalMutation({
  args: {
    userId: v.id("users"),
    title: v.optional(v.string()),
    author: v.optional(v.string()),
    sections: v.array(
      v.object({
        title: v.string(),
        orderIndex: v.number(),
        depth: v.number(),
        textStorageId: v.optional(v.id("_storage")),
        textSize: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const ownerId = args.userId;
    const existing = await ctx.db.get(ownerId);
    if (!existing) {
      throw new Error("Seed user not found.");
    }
    const now = Date.now();
    const bookId = await ctx.db.insert("books", {
      ownerId,
      title: args.title ?? "Demo Book",
      author: args.author ?? "Librium",
      sectionCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    for (const section of args.sections) {
      await ctx.db.insert("sections", {
        bookId,
        createdAt: now,
        ...section,
      });
    }

    await ctx.db.patch(bookId, {
      sectionCount: args.sections.length,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("userBooks", {
      userId: ownerId,
      bookId,
      lastSectionIndex: 0,
      lastChunkIndex: 0,
      lastChunkOffset: 0,
      lastScrollRatio: 0,
      lastScrollTop: 0,
      lastScrollHeight: 0,
      lastClientHeight: 0,
      updatedAt: Date.now(),
    });

    return { bookId, ownerId, sectionCount: args.sections.length };
  },
});

export const upsertBetterAuthUserInternal = internalMutation({
  args: {
    externalId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_external_id", (q) =>
        q.eq("authProvider", "better-auth").eq("externalId", args.externalId),
      )
      .first();
    if (existing) {
      if (
        (args.email && args.email !== existing.email) ||
        (args.name && args.name !== existing.name)
      ) {
        await ctx.db.patch(existing._id, {
          email: args.email ?? existing.email,
          name: args.name ?? existing.name,
        });
      }
      return existing._id;
    }
    const now = Date.now();
    return await ctx.db.insert("users", {
      authProvider: "better-auth",
      externalId: args.externalId,
      email: args.email ?? undefined,
      name: args.name ?? undefined,
      createdAt: now,
    });
  },
});

export const createDemoBook = action({
  args: {
    userId: v.id("users"),
    title: v.optional(v.string()),
    author: v.optional(v.string()),
    sectionCount: v.optional(v.number()),
    chunksPerSection: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!allowSeed) {
      throw new Error("Seeding is disabled in this environment.");
    }
    const sections = await buildSeedSections(
      ctx,
      args.sectionCount,
      args.chunksPerSection,
    );
    return await ctx.runMutation("seed:createDemoBookInternal", {
      userId: args.userId,
      title: args.title,
      author: args.author,
      sections,
    });
  },
});

export const createDemoUserAndBook = action({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
    title: v.optional(v.string()),
    author: v.optional(v.string()),
    sectionCount: v.optional(v.number()),
    chunksPerSection: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!allowSeed) {
      throw new Error("Seeding is disabled in this environment.");
    }
    const baseUrl =
      process.env.CONVEX_SITE_URL ??
      process.env.VITE_CONVEX_SITE_URL ??
      process.env.CONVEX_URL ??
      process.env.VITE_CONVEX_URL;
    if (!baseUrl) {
      throw new Error("Missing Convex site URL for auth.");
    }
    const signUpUrl = new URL("/api/auth/sign-up/email", baseUrl).toString();
    const signInUrl = new URL("/api/auth/sign-in/email", baseUrl).toString();

    const createOrSignIn = async () => {
      const response = await fetch(signUpUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: args.email,
          password: args.password,
          name: args.name,
          rememberMe: true,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body?.user?.id) {
        return body.user;
      }
      const message = String(body?.message ?? "");
      const isExisting =
        response.status === 422 ||
        message.toLowerCase().includes("already exists") ||
        message.toLowerCase().includes("use another email");
      if (!isExisting) {
        throw new Error(body?.message ?? "Failed to create user.");
      }
      const signInResponse = await fetch(signInUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: args.email,
          password: args.password,
          rememberMe: true,
        }),
      });
      const signInBody = await signInResponse.json().catch(() => ({}));
      if (!signInResponse.ok || !signInBody?.user?.id) {
        throw new Error(signInBody?.message ?? "Failed to sign in user.");
      }
      return signInBody.user;
    };

    const authUser = await createOrSignIn();
    const userId = await ctx.runMutation("seed:upsertBetterAuthUserInternal", {
      externalId: authUser.id,
      email: authUser.email ?? args.email,
      name: authUser.name ?? args.name,
    });

    const sections = await buildSeedSections(
      ctx,
      args.sectionCount,
      args.chunksPerSection,
    );
    const book = await ctx.runMutation("seed:createDemoBookInternal", {
      userId,
      title: args.title,
      author: args.author,
      sections,
    });

    return {
      userId,
      authUserId: authUser.id,
      email: authUser.email ?? args.email,
      bookId: book.bookId,
      sectionCount: book.sectionCount,
    };
  },
});

const buildSeedSections = async (
  ctx: Parameters<typeof createDemoBook.handler>[0],
  sectionCountInput?: number,
  chunksPerSectionInput?: number,
) => {
  const sectionCount = Math.max(1, sectionCountInput ?? 6);
  const chunksPerSection = Math.max(1, chunksPerSectionInput ?? 24);
  const sections = [];
  for (let s = 0; s < sectionCount; s += 1) {
    const paragraphs = [];
    for (let c = 0; c < chunksPerSection; c += 1) {
      paragraphs.push(
        `Section ${s + 1} — paragraph ${
          c + 1
        } placeholder content for reader testing.`,
      );
    }
    const text = paragraphs.join("\n\n");
    const storageId = await ctx.storage.store(
      new Blob([text], { type: "text/plain" }),
    );
    sections.push({
      title: `Section ${s + 1}`,
      orderIndex: s,
      depth: 0,
      textStorageId: storageId,
      textSize: text.length,
    });
  }
  return sections;
};
