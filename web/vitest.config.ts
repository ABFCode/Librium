import { fileURLToPath, URL } from "node:url";
import viteReact from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
		alias: [
			{
				find: /^@\//,
				replacement: `${fileURLToPath(new URL("./src", import.meta.url))}/`,
			},
		],
		dedupe: ["react", "react-dom"],
	},
	optimizeDeps: {
		include: [
			"react",
			"react-dom",
			"react/jsx-runtime",
			"react/jsx-dev-runtime",
			"vitest-browser-react",
			"convex/react",
			"convex/server",
		],
	},
	plugins: [viteReact()],
	test: {
		testTimeout: 10_000,
		projects: [
			{
				test: {
					name: "node",
					include: ["src/test/**/*.test.{ts,tsx}"],
					exclude: [
						"src/test/**/*.browser.test.{ts,tsx}",
						"src/test/**/*.convex.test.{ts,tsx}",
					],
					environment: "node",
				},
			},
			{
				// convex-test runs the real backend functions in an in-memory
				// Convex on the edge runtime.
				test: {
					name: "convex",
					include: ["src/test/**/*.convex.test.{ts,tsx}"],
					environment: "edge-runtime",
					server: { deps: { inline: ["convex-test"] } },
				},
			},
			{
				test: {
					name: "browser",
					// Browser-only setup (vitest-browser-react) must not load in the
					// node project.
					setupFiles: ["./src/test/setup.ts"],
					include: ["src/test/**/*.browser.test.{ts,tsx}"],
					browser: {
						enabled: true,
						// These component suites mock shared modules such as convex/react.
						// Run files serially so a slower CI browser cannot observe another
						// file's mock graph while Vite is still loading it.
						fileParallelism: false,
						provider: playwright(),
						instances: [{ browser: "chromium" }],
						headless:
							process.env.VITEST_BROWSER_HEADLESS === "true" ||
							Boolean(process.env.CI),
					},
				},
			},
		],
	},
});
