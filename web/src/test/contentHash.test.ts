import { describe, expect, test } from "vitest";
import { sha256Hex } from "../lib/contentHash";

describe("sha256Hex", () => {
	test("matches the standard SHA-256 vector", async () => {
		const bytes = new TextEncoder().encode("abc");
		await expect(sha256Hex(bytes)).resolves.toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
	});

	test("hashes only the view's bytes, not the whole backing buffer", async () => {
		// A subarray whose byteOffset/byteLength cover just "abc" inside a larger
		// buffer must hash identically to a standalone "abc" — the digest must
		// honor the view bounds, never the padding around it.
		const backing = new Uint8Array([
			255,
			0,
			...new TextEncoder().encode("abc"),
			9,
		]);
		const view = backing.subarray(2, 5);
		expect(view.byteOffset).toBe(2);
		expect(view.byteLength).toBe(3);
		await expect(sha256Hex(view)).resolves.toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
	});
});
