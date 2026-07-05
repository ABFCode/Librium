import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'url'

const config = defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    tailwindcss(),
    devtools(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),

    // File-based routing (must come before the React plugin).
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    viteReact(),

    // Offline-capable app shell: precache the built assets so the app boots
    // with no network (content comes from IndexedDB — see src/lib/db.ts).
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico,woff,woff2}'],
        navigateFallback: '/index.html',
      },
      manifest: {
        name: 'Librium',
        short_name: 'Librium',
        description: 'Your personal library, reimagined for focus and flow.',
        start_url: '/',
        display: 'standalone',
        background_color: '#171412',
        theme_color: '#171412',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
})

export default config
