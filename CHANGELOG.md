# Changelog

## 0.9.0 - 2026-07-07
- **Reading status:** every book has a status — Reading / Want to read / Finished / Abandoned — set from the card menu (re-picking clears back to Automatic) or in bulk via "Mark as" over a selection. Unset books derive their status from progress (untouched → Want to read, started → Reading, ≥99% → Finished). Local-first with LWW sync on its own clock (`statusEditedAt`, disjoint from progress), so status edits work offline and never clobber or get clobbered by progress writes.
- **Collections:** user-named, many-to-many book groups (a book can live in several) — "Add to collection…" from the card menu or over a bulk selection opens a picker with inline create; a Manage dialog renames/deletes. Fully offline-capable on the bookmark tombstone pattern (idempotent clientKey creates, deletedAt tombstones), with one new rule: memberships reference collections by client key, and pushes send collections first so books added to an offline-created collection sync correctly on reconnect.
- **Series shelves:** a new "Series" sort groups the library by the EPUB's series metadata, volumes ordered numeric-aware ("Vol 2" before "Vol 10", fractional indexes like "1.5" in place); standalone books trail in one group. Works offline (series fields mirrored into the local shelf rows).
- **Shelf filters:** a filter row under the header — status tabs, an "On this device" toggle (downloaded-only), and a Collection dropdown — all composable with search and sort, persisted across visits (`library:filters`).
- **Sync hardening:** push passes now serialize on a promise queue and re-read dirty rows from IndexedDB — a change landing while a push was in flight could previously be dropped, stranding unsynced edits until the next unrelated write.
- **Library toolbar extracted** (`LibraryToolbar`) — LibraryView had grown past 1,100 lines; the header/filter chrome is now a presentational component.
- New e2e journey (`library.spec.ts`): status via menu → shelf tabs → collection create/file/filter → reload persistence; browser tests for the collection-sync push ordering, picker dialog, and every new filter.

## 0.8.1 - 2026-07-06
- **Adopt Biome:** replaces the absent lint/format setup with Biome 2.5 (recommended rules + type-aware promise-safety rules) as a single dependency; `biome ci` gates CI ahead of the typecheck. One-time reformat + lint fixes across 76 files — missing button `type` attributes, non-null assertions replaced with real narrowing (surfaced one latent type hole in `authHelpers.ts`), module-scoped pure helpers pulled out of `ReaderExperience`, a11y suppressions documented where pointer-only affordances (backdrop click-to-close, hover-out menus) are intentional.

## 0.8.0 - 2026-07-06
- **UX refresh (design system):** one accent color (gold; red is destructive-only, muted green is semantic success), flat surfaces on a single radius/shadow scale, no pill shapes or tracked-uppercase micro-labels, calmer background. Every screen reflowed: library gets a page heading + quiet stats line and a denser cover grid; import is a single centered drop zone with the queue appearing beneath; auth/landing are single centered cards with the marketing filler removed.
- **Reader rework:** the reader owns the full viewport (app header hidden on `/reader`) — slim top bar with back-to-library, chapter title, and position ("N / M · X%"); full-height text column (no more 70vh box). Chapters/search/bookmarks live in a compact popover under the ☰ button (book title + "Chapter N of M" header, auto-scrolls to the current chapter, closes on selection/Esc/click-outside). Kindle-style page-turn zones in the margins (hover chevrons, wheel-transparent, deltaMode-aware for Firefox).
- **Whole-book search:** the drawer's Search tab scans the entire book from IndexedDB — built for 2,000-chapter novels (per-book pre-lowercased text cache built once with event-loop yields, debounced cancellable scans, capped results). Results show their chapter and jump across sections to the exact paragraph.
- **Scroll position rework:** positions (progress *and* bookmarks) are saved as layout-independent anchors — block index + fraction within it — so they restore exactly across devices, font sizes, and widths. Restore is instant with content visible (no more blank-out/"Restoring position…" overlay); fonts/images settling and font-size changes silently re-anchor; scroll saves settle with a trailing emit. Not backward compatible with old pixel offsets (WIP data).
- **Progress percent, correctly:** completed chapters plus the fraction of the current one (new `sectionFraction` synced end-to-end) — fresh books read 0%, 1-chapter books progress, finishing a book reaches 100%.
- **Library multi-select:** Select mode with per-cover check badges; bulk Download / Export EPUBs / Remove downloads / Delete over the selection, plus Select all. Bulk operations share one list-parameterized implementation with the whole-library actions (now in an overflow ⋯ menu).
- **Export:** "Export all EPUBs" (and per-selection export) pulls the master copies from R2 (egress-free), fetched to blobs so files are named `<Title>.epub` instead of the R2 key basename.
- **In-app dialogs:** a styled ConfirmDialog replaces every native `window.confirm`/`prompt` in the library — Esc/click-outside cancel, destructive flows use an inline type-DELETE input; no global Enter-to-confirm (Enter on Cancel used to execute the action).
- **Settings:** font size is a 12–36px slider with a type-in px field; reading font choice (Sans/Serif — IBM Plex/Fraunces, both self-hosted); modal restyled with live preview behind a light backdrop, Esc/click-outside close.
- **Parser fix ships (@abfcode/spine 0.1.1):** inline text runs keep their boundary spaces ("what *are* you", not "whatareyou"); `PARSER_VERSION` bump re-parses stored books from the raw EPUB on next open, healing the whole library retroactively.
- **Storage hygiene:** the library storage figure reads the IndexedDB portion, samples after deletes settle, displays whole MBs, and an orphan sweep (once per visit) clears content rows left by interrupted deletes and legacy dev data.
- **Review hardening:** a branch-wide 8-angle review confirmed and fixed 19 findings — highlights: cross-section jumps no longer anchor against the previous chapter's DOM, stale re-anchor closures are token-invalidated, Escape layering respects open dialogs, `fontFamily` can't be reset by stale clients, and the search cache invalidates on re-parse.

## 0.7.0 - 2026-07-05
- **Deployed (ROADMAP Phase 7 — complete):** Librium now runs at a real URL, **[librium.dev](https://librium.dev)**, on the target zero-ops stack — Cloudflare Pages (static app, auto-deploy on push to `main`) + Convex Cloud (auth + sync) + Cloudflare R2 (raw EPUBs/covers), with a dedicated prod R2 bucket and CORS. Infra cost is $0/mo at current library size.
- **Closed registration:** sign-up is disabled by default on deployed instances (`emailAndPassword.disableSignUp`); reopen at release by setting `ALLOW_SIGNUP=true` on the Convex deployment (env-only, no redeploy) — same convention as `ALLOW_ADMIN_RESET` / `ALLOW_SEED`, which keep the admin-reset and seed functions inert on prod. Sign-in is unaffected. The UI reflects the state via a public `config.signupEnabled` query: the sign-up page shows a "Registration is closed" panel and the Sign up / Create account links are hidden.
- **Auth rate limiting:** auth endpoints are throttled on deployed instances via Better Auth's rate limiter with `storage: "database"` (counters persist in the component's `rateLimit` table — serverless-safe), sign-in capped tighter (20/60s) than the 100/60s global default. Disabled locally so dev/tests aren't throttled.

## 0.6.0 - 2026-07-05
- **Import queue UI fix:** long titles truncate instead of blowing out the layout.
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