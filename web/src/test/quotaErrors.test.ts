import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { formatStorage, quotaErrorMessage } from "../lib/quotaErrors";

describe("formatStorage", () => {
	it("scales units sensibly", () => {
		expect(formatStorage(0)).toBe("< 1 MB");
		expect(formatStorage(5 * 1024 * 1024)).toBe("5 MB");
		expect(formatStorage(1.5 * 1024 ** 3)).toBe("1.5 GB");
	});
});

describe("quotaErrorMessage", () => {
	it("maps quota_exceeded with sizes", () => {
		const msg = quotaErrorMessage(
			new ConvexError({
				code: "quota_exceeded",
				usedBytes: 240 * 1024 * 1024,
				limitBytes: 250 * 1024 * 1024,
			}),
		);
		expect(msg).toContain("240 MB of 250 MB");
		expect(msg).toContain("existing books are unaffected");
	});

	it("maps quota_exceeded without sizes", () => {
		const msg = quotaErrorMessage(new ConvexError({ code: "quota_exceeded" }));
		expect(msg).toContain("Cloud storage is full");
	});

	it("maps cover_too_large and update_required", () => {
		expect(
			quotaErrorMessage(new ConvexError({ code: "cover_too_large" })),
		).toContain("too large");
		expect(
			quotaErrorMessage(new ConvexError({ code: "update_required" })),
		).toContain("reload");
	});

	it("returns null for everything else (falls through to generic handling)", () => {
		expect(quotaErrorMessage(new Error("boom"))).toBeNull();
		expect(quotaErrorMessage(new ConvexError({ code: "other" }))).toBeNull();
		expect(quotaErrorMessage(new ConvexError("plain string"))).toBeNull();
		expect(quotaErrorMessage(undefined)).toBeNull();
	});
});
