# Librium — Personal Ebook Library & Reader

Librium is a performance‑focused web app for uploading, managing, and reading your personal EPUB library. EPUBs are parsed entirely in the browser; the app ships as a static SPA.

## Stack

* **Web app:** React 19 + TanStack Router + Vite + Tailwind, static SPA (`/web`)
* **Data/Auth:** Convex (with Better Auth) (`/web/convex`)
* **EPUB parsing:** in-browser, via [`@abfcode/spine`](https://www.npmjs.com/package/@abfcode/spine) (TypeScript port of Spine)
* **Storage:** Convex Storage (EPUBs, section content blocks, and assets)

## Features (current)

* **Local-first reading:** every read is a local IndexedDB read; offline is a first-class mode; R2 holds the master EPUBs for durability and device seeding
* **Import:** bulk EPUB upload, parsed in a Web Worker in the browser ([`@abfcode/spine`](https://www.npmjs.com/package/@abfcode/spine)); no parser service
* **Library:** covers, search, sort (incl. series shelves), status shelves (Reading / Want to / Finished / Abandoned), collections, multi-select bulk actions, per-device download management
* **Reader:** TOC/search/bookmarks drawer, whole-book search, chapter-turn nav at content end, page-turn margins on desktop, inline images (paper-backed in dark themes), position anchors that survive font/layout changes
* **Reader prefs:** font family/size, line height, content width, night/sepia/paper themes
* **Metadata:** edit any book's identity; fetch from Open Library / Google Books; NovelUpdates linking with a one-paste companion extension (`extension/`) that clips page + cover past Cloudflare
* **Export:** EPUBs come back out with your edited metadata and cover baked in (spine writer)
* **Sync:** progress, bookmarks, status, and collections sync near-realtime across devices (LWW + tombstones); works offline, reconciles on reconnect
* **PWA:** installable, offline app shell, persistent-storage request so iOS doesn't evict the library
* **Supporter plan (optional):** cloud-storage quota with a free allowance and a yearly Supporter subscription via Polar (merchant of record); quota gates new uploads only — reading, sync, and export are never limited, and everything runs free/unlimited until the operator configures Polar (`web/docs/billing-setup.md`)

## Quick start (dev)

1) Install dependencies:
```
cd web
pnpm install
```

2) Install Playwright browsers (for UI tests):
```
cd web
pnpm exec playwright install
```
If Playwright reports missing system libraries on Linux, run:
```
cd web
npx playwright install-deps
```

3) Start Convex:
```
cd web
pnpm convex dev
```

4) Start the web app:
```
cd web
pnpm dev
```

EPUBs are parsed in the browser on upload (no separate parser service).

## Resetting dev data

```
make convex-reset CONFIRM=RESET
```

## Tests

```
cd web
pnpm test
```

Browser tests run headless by default in CI. To see the browser locally:
```
cd web
VITEST_BROWSER_HEADLESS=false pnpm test:watch
```

To run only browser or node tests:
```
cd web
pnpm test:browser
pnpm test:node
```

E2E smoke tests (Playwright):
```
cd web
pnpm test:e2e
```

## Known limitations (0.1.0)

- EPUB only (additional formats planned).
- Auth is basic email/password (reset/2FA planned).
- Offline reading is not supported yet.

## Status

Active development. Expect breaking changes while the new stack stabilizes.

## License

Apache License 2.0. See `LICENSE`.
