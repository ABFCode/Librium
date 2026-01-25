import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const resetAllData = mutation({
  args: {
    confirm: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.confirm !== "RESET") {
      throw new Error("Confirmation required.");
    }

    const bookAssets = await ctx.db.query("bookAssets").collect();
    for (const asset of bookAssets) {
      await ctx.storage.delete(asset.storageId);
      await ctx.db.delete(asset._id);
    }

    const sections = await ctx.db.query("sections").collect();
    for (const section of sections) {
      if (section.textStorageId) {
        await ctx.storage.delete(section.textStorageId);
      }
      if (section.contentStorageId) {
        await ctx.storage.delete(section.contentStorageId);
      }
      await ctx.db.delete(section._id);
    }

    const files = await ctx.db.query("bookFiles").collect();
    for (const file of files) {
      await ctx.storage.delete(file.storageId);
      await ctx.db.delete(file._id);
    }

    const importJobs = await ctx.db.query("importJobs").collect();
    for (const job of importJobs) {
      await ctx.db.delete(job._id);
    }

    const bookmarks = await ctx.db.query("bookmarks").collect();
    for (const bookmark of bookmarks) {
      await ctx.db.delete(bookmark._id);
    }

    const userBooks = await ctx.db.query("userBooks").collect();
    for (const entry of userBooks) {
      await ctx.db.delete(entry._id);
    }

    const userSettings = await ctx.db.query("userSettings").collect();
    for (const setting of userSettings) {
      await ctx.db.delete(setting._id);
    }

    const books = await ctx.db.query("books").collect();
    for (const book of books) {
      if (book.coverStorageId) {
        await ctx.storage.delete(book.coverStorageId);
      }
      await ctx.db.delete(book._id);
    }

    const users = await ctx.db.query("users").collect();
    for (const user of users) {
      await ctx.db.delete(user._id);
    }

    return { ok: true };
  },
});
