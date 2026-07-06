import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";

const deploymentName = process.env.CONVEX_DEPLOYMENT ?? "";
const convexUrl = process.env.CONVEX_URL ?? process.env.CONVEX_SITE_URL ?? "";
const isLocalDeployment =
	deploymentName.startsWith("local") ||
	deploymentName.startsWith("anonymous") ||
	deploymentName.includes("local") ||
	deploymentName.includes("anonymous");
const isLocalConvex =
	convexUrl.includes("127.0.0.1") || convexUrl.includes("localhost");
const allowAdminReset =
	process.env.ALLOW_ADMIN_RESET === "true" ||
	isLocalDeployment ||
	isLocalConvex;

// Note: blobs live in R2 now; this clears Convex rows only. Orphaned R2
// objects from a full reset are dev debris — clear the bucket manually (or
// via lifecycle rules) if it matters.
export const resetAllDataInternal = internalMutation({
	args: {},
	handler: async (ctx) => {
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
			// Legacy pre-R2 rows stored the cover in Convex storage.
			const legacyCover = (book as unknown as { coverStorageId?: never })
				.coverStorageId;
			if (legacyCover) {
				await ctx.storage.delete(legacyCover).catch(() => {});
			}
			await ctx.db.delete(book._id);
		}

		const users = await ctx.db.query("users").collect();
		for (const user of users) {
			await ctx.db.delete(user._id);
		}

		// Legacy tables from pre-R2 schemas: rows here block pushing a schema
		// that no longer declares them, and their Convex-storage blobs would
		// otherwise be orphaned. Safe to remove once nothing references them.
		const legacyTables = ["sections", "bookAssets", "bookFiles", "importJobs"];
		for (const table of legacyTables) {
			try {
				const rows = await ctx.db.query(table as never).collect();
				for (const row of rows) {
					const r = row as unknown as {
						_id: never;
						storageId?: never;
						contentStorageId?: never;
					};
					if (r.storageId) {
						await ctx.storage.delete(r.storageId).catch(() => {});
					}
					if (r.contentStorageId) {
						await ctx.storage.delete(r.contentStorageId).catch(() => {});
					}
					await ctx.db.delete(r._id);
				}
			} catch {
				// Table no longer exists — nothing to clean.
			}
		}

		return { ok: true };
	},
});

export const resetAllData = mutation({
	args: {
		confirm: v.string(),
	},
	// Explicit return type: referencing internal.admin from inside this module
	// is self-referential for inference and needs the annotation to break the
	// cycle (standard Convex pattern).
	handler: async (ctx, args): Promise<{ ok: boolean }> => {
		if (args.confirm !== "RESET") {
			throw new Error("Confirmation required.");
		}
		if (!allowAdminReset) {
			throw new Error("Reset is disabled in this environment.");
		}
		return await ctx.runMutation(internal.admin.resetAllDataInternal, {});
	},
});
