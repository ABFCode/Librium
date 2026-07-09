// Shared corpus-test helpers: real testbooks (dev machines only — the
// copyrighted files are gitignored) and a synthetic 1x1 PNG.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const TESTBOOKS_DIR = join(__dirname, "../../../testbooks");

export const testbook = (name: string) =>
	new Uint8Array(readFileSync(join(TESTBOOKS_DIR, name)));

// 1x1 transparent PNG.
export const DOT_PNG = Uint8Array.from(
	atob(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
	),
	(c) => c.charCodeAt(0),
);
