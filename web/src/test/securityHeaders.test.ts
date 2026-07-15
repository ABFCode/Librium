import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const headers = readFileSync(resolve(process.cwd(), "public/_headers"), "utf8");

describe("Cloudflare Pages security headers", () => {
	it("keeps the baseline browser hardening policy", () => {
		for (const directive of [
			"Content-Security-Policy:",
			"default-src 'self'",
			"script-src 'self'",
			"object-src 'none'",
			"frame-ancestors 'none'",
			"Strict-Transport-Security:",
			"X-Frame-Options: DENY",
			"X-Content-Type-Options: nosniff",
			"Permissions-Policy:",
		]) {
			expect(headers).toContain(directive);
		}
	});

	it("does not cache the service-worker entry point", () => {
		expect(headers).toContain("/sw.js");
		expect(headers).toContain(
			"Cache-Control: no-cache, no-store, must-revalidate",
		);
	});
});
