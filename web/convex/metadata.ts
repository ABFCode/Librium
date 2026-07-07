import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireBookOwner } from "./authHelpers";

// User-edited book metadata. Online-only by design (the books table is
// server-authoritative); the client mirrors accepted edits into its local
// shelf row. Every field is optional: absent = unchanged, null = clear.

export const updateBookMetadata = mutation({
	args: {
		bookId: v.id("books"),
		// Title is required on books — it can change but never clear.
		title: v.optional(v.string()),
		author: v.optional(v.union(v.string(), v.null())),
		series: v.optional(v.union(v.string(), v.null())),
		seriesIndex: v.optional(v.union(v.string(), v.null())),
		description: v.optional(v.union(v.string(), v.null())),
		language: v.optional(v.union(v.string(), v.null())),
		sourceUrl: v.optional(v.union(v.string(), v.null())),
		subjects: v.optional(v.union(v.array(v.string()), v.null())),
	},
	handler: async (ctx, args) => {
		await requireBookOwner(ctx, args.bookId);
		const { bookId, title, ...rest } = args;
		if (title !== undefined && title.trim().length === 0) {
			throw new Error("Title cannot be empty.");
		}
		const patch: Record<string, unknown> = {};
		if (title !== undefined) {
			patch.title = title.trim();
		}
		for (const [field, value] of Object.entries(rest)) {
			if (value === undefined) {
				continue;
			}
			// null → undefined: a Convex patch removes fields set to undefined.
			patch[field] = value ?? undefined;
		}
		patch.updatedAt = Date.now();
		await ctx.db.patch(bookId, patch);
	},
});
