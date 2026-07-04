import { action, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const getSectionContent = action({
  args: {
    sectionId: v.id("sections"),
  },
  handler: async (ctx, args): Promise<{ blocks: unknown[] | null }> => {
    const section = await ctx.runQuery(api.sections.getSection, {
      sectionId: args.sectionId,
    });
    let blocks: unknown[] | null = null;
    if (section?.contentStorageId) {
      const blob = await getStorageBlob(ctx, section.contentStorageId);
      if (blob) {
        try {
          blocks = JSON.parse(await blob.text());
        } catch {
          blocks = null;
        }
      }
    }
    return { blocks };
  },
});

const getStorageBlob = async (ctx: ActionCtx, storageId: string) => {
  if (typeof ctx.storage.get === "function") {
    const blob = await ctx.storage.get(storageId);
    if (blob) {
      return blob;
    }
  }
  const url = await ctx.storage.getUrl(storageId);
  if (!url) {
    return null;
  }
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }
  return await response.blob();
};
