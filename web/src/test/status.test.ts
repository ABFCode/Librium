import { describe, expect, it } from "vitest";
import { effectiveStatus, statusLabel } from "../lib/status";

describe("effectiveStatus", () => {
	it("derives want for an untouched book", () => {
		expect(effectiveStatus(null, 0)).toBe("want");
		expect(effectiveStatus(undefined, 0)).toBe("want");
	});

	it("derives reading once there is any progress", () => {
		expect(effectiveStatus(null, 0.01)).toBe("reading");
		expect(effectiveStatus(null, 0.98)).toBe("reading");
	});

	it("derives finished at the end of the book", () => {
		expect(effectiveStatus(null, 0.99)).toBe("finished");
		expect(effectiveStatus(null, 1)).toBe("finished");
	});

	it("lets an explicit status override any progress", () => {
		expect(effectiveStatus("abandoned", 1)).toBe("abandoned");
		expect(effectiveStatus("finished", 0)).toBe("finished");
		expect(effectiveStatus("want", 0.5)).toBe("want");
	});

	it("clearing back to null returns to the derived value", () => {
		// Simulates: user set "abandoned", then picked "Automatic".
		expect(effectiveStatus(null, 0.5)).toBe("reading");
	});
});

describe("statusLabel", () => {
	it("maps keys to display labels", () => {
		expect(statusLabel("want")).toBe("Want to read");
		expect(statusLabel("reading")).toBe("Reading");
	});
});
