import { describe, expect, test } from "vitest";
import { safeExternalHref } from "../lib/externalUrl";

describe("safeExternalHref", () => {
	test("accepts and canonicalizes HTTPS links", () => {
		expect(safeExternalHref(" https://example.com/a book ")).toBe(
			"https://example.com/a%20book",
		);
	});

	test.each([
		undefined,
		null,
		"",
		"not a URL",
		"http://example.com",
		"javascript:alert(1)",
		"data:text/html,<h1>unsafe</h1>",
		"https://user:password@example.com/private",
	])("rejects a non-navigable or unsafe value: %s", (value) => {
		expect(safeExternalHref(value)).toBeNull();
	});
});
