# Changelog

## Unreleased
- **Static SPA (ROADMAP Phase 1):** removed TanStack Start and the nitro SSR server; the app is now a plain Vite + TanStack Router single-page app (`index.html` + `src/main.tsx` entry, route code-splitting via `@tanstack/router-plugin`). `vite build` emits a fully static `dist/` deployable to any static host. Auth is unaffected (Better Auth is served by Convex HTTP actions, not the removed Node server). Drops the `nitro` nightly pin and `@tanstack/react-start`/`react-router-ssr-query` dependencies.

## 0.1.0 - 2026-01-26

- New TanStack Start + Convex stack with Better Auth (email/password).
- EPUB import pipeline with parser service integration and Convex storage.
- Library view with covers, sorting, search, and protected actions.
- Reader experience with TOC, next/prev, bookmarks, and preferences.
- Progress tracking and resume support.
- Added browser tests (Vitest Browser Mode) and Playwright smoke tests.

  ## 0.1.1 - 2026-01-26
  - Remove unused template files/assets (benchmarks, TanStack scaffolding, sample logos).
  - Clean up .gitignore.

## 0.1.2 - 2026-07-03
- Upgrade all web dependencies to latest; npm audit vulnerabilities cleared (44 → 0), including better-auth 1.6 + Convex adapter 0.12, Convex 1.42, Vite 8, TanStack Start/Router 1.168, and TypeScript 6.
- Upgrade the Go parser: toolchain go 1.25.11 (stdlib CVE fixes), Spine 0.3.1, and golang.org/x/* to latest; govulncheck clean (19 → 0).
- Minor fixes surfaced by the upgrade: remove deprecated tsconfig `baseUrl`, add the missing default export on the library route, and match Convex functions by name in the Library test mock.

## 0.2.0 - 2026-07-04
- Parse EPUBs in the browser: replaced the Go parser microservice with **Spine-TS**, a TypeScript port of Spine (`web/src/spine`). Removes the third deployable service and its hosting/reachability requirements. Validated exact/near-exact against Go Spine on a corpus of real books.
- Scalable import: in-browser parse + batched, blocks-only ingest via storage upload URLs — no book-sized payload passes through a Convex function, fixing the 64 MB out-of-memory failure on large webnovels (thousand-chapter books now import and read).
- Blocks-only data model: sections store per-section structured blocks (no duplicated plain text); reading progress is block-anchored (`lastBlockIndex`/`lastBlockOffset`); bookmarks use `blockIndex`.
- Removed the Go `/parser` service, `PARSER_URL`, and related Makefile/README wiring.
- **Breaking:** the data model changed; existing dev data must be reset (`make convex-reset CONFIRM=RESET`).

## 0.3.0 - 2026-07-04
- Extracted the EPUB parser into its own package, **[`@abfcode/spine`](https://www.npmjs.com/package/@abfcode/spine)** (published to npm); Librium now consumes it as a normal dependency.
- Parallelized the import ingest (concurrent batches) and virtualized the chapter list (TOC) — large books import and browse smoothly.
- Fixed book deletion to run in bounded batches so thousand-chapter books stay under Convex's per-mutation read limit.
- Self-hosted fonts (Fraunces + IBM Plex Sans via `@fontsource`), removing the third-party Google Fonts request (blocked by Firefox tracking protection / adblockers).