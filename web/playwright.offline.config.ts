import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	testMatch: "offlinePwa.spec.ts",
	timeout: 120_000,
	expect: { timeout: 20_000 },
	use: {
		baseURL: "http://localhost:4173",
		trace: "on-first-retry",
	},
	webServer: {
		command:
			"node node_modules/vite/bin/vite.js build && node node_modules/vite/bin/vite.js preview --port 4173",
		url: "http://localhost:4173",
		reuseExistingServer: false,
		timeout: 120_000,
	},
});
