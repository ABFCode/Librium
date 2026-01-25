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

const createDemoBookInternal = internalMutation({
  args: {
    userId: v.id("users"),
    title: v.optional(v.string()),
    author: v.optional(v.string()),
    sectionCount: v.optional(v.number()),
    chunksPerSection: v.optional(v.number()),
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

    const sectionCount = Math.max(1, args.sectionCount ?? 6);
    const chunksPerSection = Math.max(1, args.chunksPerSection ?? 24);
    const sectionsToInsert = [];

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
      sectionsToInsert.push({
        title: `Section ${s + 1}`,
        orderIndex: s,
        depth: 0,
        bookId,
        textStorageId: storageId,
        textSize: text.length,
        createdAt: now,
      });
    }

    for (const section of sectionsToInsert) {
      await ctx.db.insert("sections", section);
    }

    await ctx.db.patch(bookId, {
      sectionCount: sectionCount,
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

    return { bookId, ownerId, sectionCount };
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
    return await ctx.runMutation("seed:createDemoBookInternal", args);
  },
});
