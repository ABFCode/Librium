import { action } from "./_generated/server";
import { v } from "convex/values";

export const getSectionContent = action({
  args: {
    sectionId: v.id("sections"),
  },
  handler: async (ctx, args) => {
    const section = await ctx.runQuery("sections:getSection", {
      sectionId: args.sectionId,
    });
    let text = "";
    let blocks: unknown[] | null = null;
    if (section?.textStorageId) {
      const blob = await getStorageBlob(ctx, section.textStorageId);
      if (blob) {
        text = await blob.text();
      }
    }
    if (section?.contentStorageId) {
      const blob = await getStorageBlob(ctx, section.contentStorageId);
      if (blob) {
        try {
          const raw = await blob.text();
          blocks = JSON.parse(raw);
        } catch {
          blocks = null;
        }
      }
    }
    return { text, blocks };
  },
});

const getStorageBlob = async (
  ctx: Parameters<typeof getSectionContent.handler>[0],
  storageId: string,
) => {
  if (typeof ctx.storage.get === "function") {
    const blob = await ctx.storage.get(storageId);
    if (blob) {
      return blob;
    }
  }
  const url = await ctx.runMutation("storage:getFileUrl", {
    storageId,
  });
  if (!url) {
    return null;
  }
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }
  return await response.blob();
};
