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
      const blob = await ctx.storage.get(section.textStorageId);
      if (blob) {
        text = await blob.text();
      }
    }
    if (section?.contentStorageId) {
      const blob = await ctx.storage.get(section.contentStorageId);
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
