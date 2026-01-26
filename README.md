# Librium — Personal Ebook Library & Reader

Librium is a performance‑focused web app for uploading, managing, and reading your personal EPUB library. It’s built as a modern, real‑time stack with a dedicated parser service.

## Stack

* **Web app:** TanStack Start + React 19 + Vite + Tailwind (`/web`)
* **Data/Auth:** Convex (with Better Auth) (`/web/convex`)
* **Parser:** Go microservice using Spine for EPUB parsing (`/parser`)
* **Storage:** Convex Storage (EPUBs, section text, and assets)

## Features (current)

* **Auth:** Email/password sign‑in + sign‑up
* **Import:** Upload EPUBs, async parsing + ingest
* **Library:** Covers, title/author, download, delete
* **Reader:** TOC, next/prev, arrow keys, bookmarks, search
* **Reader prefs:** Font size, line height, content width, theme
* **Progress:** Remembers last section + scroll position

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

3) Start the parser:
```
cd parser
go run ./main.go
```

4) Start Convex:
```
cd web
pnpm convex dev
```

5) Start the web app:
```
cd web
pnpm dev
```

The parser defaults to `http://localhost:8081/parse`. Override with `PARSER_URL` if needed.

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

## Status

Active development. Expect breaking changes while the new stack stabilizes.

## License

Apache License 2.0. See `LICENSE`.
