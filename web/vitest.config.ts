import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { fileURLToPath, URL } from 'url'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@\//,
        replacement: `${fileURLToPath(new URL('./src', import.meta.url))}/`,
      },
    ],
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'vitest-browser-react',
      'convex/react',
      'convex/server',
    ],
  },
  plugins: [
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    viteReact(),
  ],
  test: {
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 10_000,
    projects: [
      {
        test: {
          name: 'node',
          include: ['src/test/**/*.test.{ts,tsx}'],
          exclude: ['src/test/**/*.browser.test.{ts,tsx}'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'browser',
          include: ['src/test/**/*.browser.test.{ts,tsx}'],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
            headless:
              process.env.VITEST_BROWSER_HEADLESS === 'true' ||
              Boolean(process.env.CI),
          },
        },
      },
    ],
  },
})
