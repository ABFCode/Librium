import { describe, expect, it } from "vitest";
import { buildFixtureEpub } from "../../e2e/fixtureEpub";
import { parseEpubOffThread } from "../lib/parseEpubOffThread";

// vitest's browser mode cannot run Vite module workers (its module
// interception breaks inside the worker context), so these tests exercise
// the main-thread fallback path by construction — which is exactly the
// degraded mode that needs coverage. The real worker path is proven in e2e:
// reading.spec asserts the fallback's console marker never appears during a
// real import in a real Vite-served app.
describe("parseEpubOffThread (fallback path)", () => {
	it("returns a full payload when the worker is unavailable", async () => {
		const payload = await parseEpubOffThread(buildFixtureEpub());
		expect(payload.metadata.title).toBe("E2E Fixture");
		expect(payload.sections.length).toBeGreaterThan(0);
		expect(payload.chunks.length).toBeGreaterThan(0);
	});

	it("keeps the caller's bytes usable after parsing", async () => {
		const bytes = buildFixtureEpub();
		await parseEpubOffThread(bytes);
		// The import flow uploads these same bytes to R2 after parsing — a
		// transferred (detached) buffer would make that upload silently empty.
		expect(bytes.byteLength).toBeGreaterThan(0);
		expect(bytes[0]).toBe(0x50); // 'P' of the zip magic — still readable
	});

	it("rejects on unparseable input instead of hanging", async () => {
		await expect(
			parseEpubOffThread(new Uint8Array([1, 2, 3, 4])),
		).rejects.toThrow();
	});
});
