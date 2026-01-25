import { action } from "./_generated/server";
import { v } from "convex/values";

export const getSectionText = action({
  args: {
    sectionId: v.id("sections"),
  },
  handler: async (ctx, args) => {
    const section = await ctx.runQuery("sections:getSection", {
      sectionId: args.sectionId,
    });
    if (!section?.textStorageId) {
      return { text: "" };
    }
    const blob = await ctx.storage.get(section.textStorageId);
    if (!blob) {
      return { text: "" };
    }
    const text = await blob.text();
    return { text };
  },
});
