import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.{js,ts}");
const SUBJECT = "metadata-user";

async function seed() {
	const t = convexTest(schema, modules);
	const bookId = await t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {
			authProvider: "better-auth",
			externalId: SUBJECT,
			createdAt: 1,
		});
		return ctx.db.insert("books", {
			ownerId: userId,
			title: "The Clockwork Orchard",
			createdAt: 1,
			updatedAt: 1,
		});
	});
	return { t, as: t.withIdentity({ subject: SUBJECT }), bookId };
}

describe("metadata source URLs", () => {
	test("rejects navigable non-HTTPS values and canonicalizes HTTPS URLs", async () => {
		const { t, as, bookId } = await seed();

		await expect(
			as.mutation(api.metadata.updateBookMetadata, {
				bookId,
				sourceUrl: "javascript:alert(document.domain)",
			}),
		).rejects.toThrow("Source page must be a valid HTTPS URL");

		await as.mutation(api.metadata.updateBookMetadata, {
			bookId,
			sourceUrl: " https://example.com/a book ",
		});
		const stored = await t.run((ctx) => ctx.db.get(bookId));
		expect(stored?.sourceUrl).toBe("https://example.com/a%20book");
	});
});
