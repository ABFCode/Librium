import { describe, expect, test } from "vitest";
import {
	nextServerVersion,
	observedServerVersion,
} from "../../convex/syncVersion";

describe("sync version primitives", () => {
	test("advances strictly when multiple writes share one millisecond", () => {
		expect(nextServerVersion(100, 100)).toBe(101);
		expect(nextServerVersion(101, 100)).toBe(102);
	});

	test("uses server time when it is safely ahead", () => {
		expect(nextServerVersion(100, 150)).toBe(150);
	});

	test("treats a missing client base as an unobserved version", () => {
		expect(observedServerVersion(undefined)).toBe(0);
	});
});
