# Changelog

## Unreleased
- **Bulk library operations:** toolbar actions — "Download all" (pre-load every book onto this device), "Clear downloads" (confirm; frees local storage, library untouched), and "Delete all" (type-DELETE confirmation; removes every book + cloud backup everywhere), each with progress feedback.
- **Bulk import (ROADMAP Phase 6):** the import page is now a queue — drop many EPUBs or an entire folder (folder picker + recursive folder drag-drop), each file imports sequentially with per-file status (Queued/Importing/Ready/Failed) and failures skip instead of aborting the batch.
- **Per-device download management (ROADMAP Phase 6):** the library shows which books' content is cached on this device (dot on the cover + "N/M on device · storage used" summary). Book menu: "Download to this device" (pre-load without opening), "Remove download" (free local space; the book, its progress, and bookmarks are untouched everywhere), "Save EPUB" (renamed from Download), "Delete book" (renamed from Remove).

## 0.5.0 - 2026-07-05
- **Structured R2 keys:** objects live under `books/{bookId}/…` (book.epub + cover) via an ownership-checked upload-URL mutation — the bucket is self-documenting.
- **Blobs → Cloudflare R2 (ROADMAP Phase 5):** raw EPUBs + covers now live in R2 (10 GB free, zero egress) via `@convex-dev/r2`; Convex storage holds no blobs. Parsed content is treated as derived data: new devices seed a book by downloading the EPUB from R2 and re-parsing it locally (`parserVersion` is stamped per book — a device with a stale parse re-seeds automatically, so parser improvements apply retroactively).
- **Backend demolition:** with content derived client-side, the `sections`, `bookAssets`, `bookFiles`, and `importJobs` tables and their modules (`ingest`, `sections`, `reader`, `bookAssets`, `bookFiles`, `importJobs`, `storage`) are gone. Import is now: parse in browser → one `registerImport` mutation → readable immediately from IndexedDB → EPUB/cover upload to R2 in the background (`attachFiles`). No batched section ingest, no Convex-id backfill; progress and bookmarks reference section indexes only. `deleteBook` no longer needs chunked deletes and also removes the R2 objects.
- **Breaking:** schema changed; dev data was reset (re-import books). Seeding now creates the demo user only (`make convex-seed`).

## 0.4.0 - 2026-07-04
- **Deleted-book handling:** a book deleted from another device no longer error-pages a reader that has it open — the reader purges the local copy and returns to the library (`books.getBook` null signal; reader-path queries return empty instead of throwing).
- **Local-first library + bookmarks (ROADMAP Phase 4, complete):** the library shelf renders from IndexedDB when offline (covers cached as local blobs; progress badges derived from local records) and reconciles against the authoritative server list when online — books deleted on another device are purged locally, and books imported elsewhere appear on every device's shelf. Bookmarks are local-first with tombstone sync: create/delete work offline, offline creates push idempotently on reconnect (client keys), and deletes propagate as server tombstones instead of being resurrected by other devices.
- **Local-first progress + LWW sync (ROADMAP Phase 4, slice 1):** reading progress is written to IndexedDB first (instant, offline-durable) and synced to Convex with last-write-wins: dirty local edits push on edit and on reconnect; the server rejects pushes older than what it holds (`progressEditedAt`), so a stale queued write can never clobber newer progress; pulls adopt remote state only when its server timestamp is newer than the last merged state and never over unpushed local edits. The reader restores from the merged view — offline reopen resumes at the exact local position; a newer remote position corrects the view only within moments of opening and never after the reader has navigated (no mid-session yanks).
- **PWA shell (ROADMAP Phase 3):** `vite-plugin-pwa` service worker precaches the app shell (JS/CSS/fonts/icon) with SPA navigation fallback — production builds boot fully offline (content already comes from IndexedDB). Installable: web app manifest + icon. Applies to `pnpm build` output only; the dev server does not emit the service worker.
- **Local-first read path (ROADMAP Phase 2):** the reader now reads from the device. Import writes the parsed book (sections + blocks + images + cover) to IndexedDB (Dexie) before ingest — readable immediately; chapter turns, TOC, and images are served from IndexedDB with no network I/O. Books imported on another device fall back to Convex and cache-fill locally (section metadata, blocks, and images) so subsequent reads are local. Deleting a book purges the local copy. `RequireAuth` gains offline grace: a previously signed-in device renders local content when offline. Progress/bookmarks still sync via Convex (durable local progress lands with the Phase 4 sync layer).
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