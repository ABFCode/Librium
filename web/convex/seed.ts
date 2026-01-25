import { action, internalAction } from "./_generated/server";
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

export const seedBookContentInternal = internalAction({
  args: {
    bookId: v.id("books"),
    sectionCount: v.optional(v.number()),
    chunksPerSection: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sectionCount = args.sectionCount ?? 3;
    const chunksPerSection = args.chunksPerSection ?? 40;
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
      const storageId = await storeBlob(
        ctx,
        new Blob([text], { type: "text/plain" }),
      );
      sectionsToInsert.push({
        title: `Section ${s + 1}`,
        orderIndex: s,
        textStorageId: storageId,
        textSize: text.length,
      });
    }

    await ctx.runMutation("ingest:insertSections", {
      bookId: args.bookId,
      sections: sectionsToInsert,
    });
  },
});

const storeBlob = async (
  ctx: Parameters<typeof seedBookContentInternal.handler>[0],
  blob: Blob,
) => {
  if (typeof ctx.storage.store === "function") {
    return await ctx.storage.store(blob);
  }
  const uploadUrl = await ctx.runMutation("storage:generateUploadUrl", {});
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: blob.type ? { "Content-Type": blob.type } : undefined,
    body: blob,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.storageId) {
    throw new Error("Failed to upload blob to storage.");
  }
  return body.storageId as string;
};

export const seedBookContent = action({
  args: {
    bookId: v.id("books"),
    sectionCount: v.optional(v.number()),
    chunksPerSection: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!allowSeed) {
      throw new Error("Seeding is disabled in this environment.");
    }
    return await ctx.runAction("seed:seedBookContentInternal", args);
  },
});
