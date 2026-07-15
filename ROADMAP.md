# Librium Roadmap

*Written 2026-07-04, after the v0.3.0 modernization (browser parsing via `@abfcode/spine`, blocks-only data model, batched ingest). This document defines where Librium goes next.*

## Vision

An incredibly fast personal book library and reader. Local-first: every read is a
local disk read; the network is never on the read path. Seamless cross-device
sync — pick up mid-chapter on any device. Zero-ops infrastructure that can sit
untouched for a year without rotting.

## Requirements

1. **Extremely performant** — instant open, instant chapter turns, instant TOC,
   even on 2,000-chapter webnovels. Implies: reads come from device storage, never
   the network.
2. **Seamless cross-device sync** — progress/bookmarks propagate near-realtime
   (push, not poll-on-open).
3. **Offline is a first-class mode** — reading works with no connection.
4. **Durability** — the library is the asset. Raw EPUBs backed up server-side;
   device storage loss is always recoverable.
5. **Zero-ops longevity** — managed/free-tier services only; no server process to
   patch; minimal moving parts.
6. **Import throughput stays first-class** — thousand-chapter webnovels parse and
   ingest without ceilings (already true as of v0.2.0).

Deferred, revisit later: highlights/notes, full-library export, iOS PWA polish
(home-screen install, `navigator.storage.persist()`, Safari eviction testing).

## Target architecture

```
┌───────────────────── device ─────────────────────┐   ┌─────────── cloud ───────────┐
│ Static SPA (CDN-delivered, service-worker cached) │   │ Cloudflare Pages — app shell│
│                                                   │   │                             │
│ IndexedDB (via Dexie):                            │   │ Cloudflare R2 (via          │
│   • parsed blocks + images  ◀── seed/re-parse ────┼───┼── @convex-dev/r2):          │
│   • raw-EPUB backup pointer                       │   │   • raw EPUBs • covers      │
│   • progress / bookmarks / library records        │   │                             │
│                                                   │   │ Convex Cloud (free tier):   │
│ @abfcode/spine — parse on device at import/seed   │◀──┼── auth (Better Auth)        │
│ Sync module — LWW push/pull ──────────────────────┼──▶│   tiny sync DB + realtime   │
└───────────────────────────────────────────────────┘   └─────────────────────────────┘
```

Two data planes with opposite characteristics:

- **Plane A — content (heavy, immutable).** Raw EPUBs and covers live in R2 (the
  master shelf). Each device holds its own parsed working copy (blocks + images) in
  IndexedDB. "Sync" here is a cache fill: *don't have book X locally → download the
  EPUB from R2 → parse on device → store in IndexedDB.* Parsed blocks are **derived
  data and are not backed up** — the raw EPUB is the source of truth and the parser
  is fast (~2s for a 2,277-chapter book on desktop). Parser improvements
  retroactively apply to the whole library.
- **Plane B — user state (tiny, mutable).** Progress, bookmarks, library
  membership, settings. Kilobytes. Written to IndexedDB first (instant, offline),
  reconciled with Convex in the background, pushed to other devices via Convex's
  reactive queries.

What this architecture **removes**:

- The SSR/nitro server (TanStack Start → static Vite SPA + TanStack Router).
  Private, login-gated, local-first app: nothing to server-render. Deletes an
  entire deployable and its dependency surface (currently pinned to a nitro
  nightly).
- Convex from the read path. It remains the auth + sync + storage-authorization
  brain, but no chapter read ever touches it.
- Convex file storage for blobs (free tier is 0.5 GB; the library is larger).
  R2: 10 GB free forever, $0.015/GB/mo after, zero egress — and egress-free matters
  because device seeding re-downloads whole books.

## Sync design (decided up front — be careful here)

The data model makes sync tractable: content never merges (immutable), and user
state is single-user last-write-wins. No CRDTs. But three rules are load-bearing:

1. **Tombstones for deletes.** Deleting a book (or bookmark) writes a
   `deletedAt` tombstone record, synced like any other change. Deletion without a
   tombstone gets resurrected by the next device that syncs. Tombstones may be
   compacted only after every known device has acknowledged them (or been
   explicitly retired); elapsed time alone is not proof that compaction is safe.
2. **Server-authoritative timestamps.** LWW ordering uses the Convex server's
   receipt time (or a server-issued monotonic version), never device wall-clocks.
   A phone with a skewed clock must not be able to clobber newer progress.
3. **Sync cursor per device.** Each device tracks the last server version it has
   seen and pulls only newer changes. Push is a queue of local mutations flushed
   when online; pull rides Convex's reactive subscription.

Conflict policy per record type:
- `progress` (per book): optimistic server versions reject stale devices.
  Accepted chapter changes and meaningful movement within long chapters retain
  the displaced position in a bounded server-side recovery history. Restoring
  first preserves the current position, then creates a new causal write; it
  never rewinds the sync clock.
- `bookmarks`: append-mostly; LWW on edits; tombstone on delete.
- `library` (book add/remove): add is idempotent (keyed by content hash);
  remove is a tombstone.
- `settings`: independent per-field optimistic versions, so simultaneous edits
  to different controls merge while stale edits to the same control lose.

## Phases

*Status: complete. Phases 1–4 shipped in v0.4.0, Phase 5 in v0.5.0, Phase 6 in
v0.6.0, and Phase 7 (harden + deploy) in v0.7.0 — Librium runs at librium.dev on
Cloudflare Pages + Convex Cloud + R2, with registration closed and auth rate
limiting. Deferred items below remain the future backlog.*

### Phase 1 — Static SPA conversion
Drop TanStack Start/nitro; ship a plain Vite + TanStack Router SPA. Keep all
routes/components (Start is built on Router — this is subtraction). Verify Better
Auth still works (it serves via Convex HTTP actions, not the Node server).
**Exit:** `vite build` emits static files that run the full app from a file server.

### Phase 2 — Local-first read path
Add Dexie. Import writes parsed blocks + images to IndexedDB *first* (book is
readable before any upload finishes). Reader and TOC read exclusively from
IndexedDB. Progress/bookmarks write locally first.
**Exit:** aeroplane-mode reading works for any imported book; chapter turns do no
network I/O.

### Phase 3 — PWA shell
`vite-plugin-pwa`: service worker caches the app shell; manifest for
installability. Minimal scope — iOS-specific polish is explicitly deferred.
**Exit:** app boots offline from a cold start.

### Phase 4 — Sync layer (Plane B)
Implement the sync module per the design above: local mutation queue, server
timestamps, tombstones, per-device cursor, Convex reactive pull. Migrate
progress/bookmarks/library records onto it.
**Exit:** two browsers, one offline: edits reconcile correctly on reconnect,
including deletes; progress hand-off between devices is near-instant.

### Phase 5 — Blob plane → R2 (Plane A)
Add `@convex-dev/r2`. Import uploads raw EPUB + cover to R2 (background, after
the local write). New-device seeding: download EPUB from R2 → parse on device →
IndexedDB. Stamp `parserVersion` on every book's local blocks; on open, if the
installed `@abfcode/spine` is newer, re-parse from the raw EPUB. Stop storing
per-section blobs in Convex storage.
**Exit:** fresh browser profile can log in, see the library, tap a book, and be
reading from local storage; total Convex storage usage is near-zero.

### Phase 6 — Library at scale
- **Bulk import:** directory picker / multi-file drag-drop; queued
  parse→IDB→R2 pipeline with progress and per-file error skip (onboard a
  multi-GB books folder in one sitting).
- **Per-device download management:** one library synced everywhere; what's
  managed is each device's *content cache* (which downloads automatically on
  first open). Adds: "remove from this device" (free space without deleting
  the book anywhere), explicit download-without-opening (pre-load for
  offline), and a storage-used view.

### Phase 7 — Harden + deploy
- Auth: close signups (allowlist / disable registration post-setup); keep
  destructive admin and seed functions internal-only; rate limiting.
- Deploy: Cloudflare Pages (app) + Convex Cloud (prod deployment) + R2 bucket.
- Per-environment buckets: the existing bucket stays dev-only; create a fresh
  prod bucket + token and set the `R2_*` env vars on the cloud deployment
  (config is per-Convex-deployment — no code change). Add the prod origin to
  both the bucket CORS policy and the auth trusted origins.
- Error reporting (optional, decide then).
**Exit:** Librium usable from any device via a real URL; total infra cost $0/mo
at current library size.

## Phase 8 — Sustainability (SHIPPED 0.15.x–0.16.0, 2026-07)

Freemium storage quota + Supporter subscription, built to never hold books
hostage. All of it env-gated and currently in the sandbox era.

- **Quota plane:** free allowance (default 250 MB) / Supporter (default
  10 GB) of R2-verified attached bytes. Gates NEW uploads only. Reading,
  sync, seeding, export, and deletes are never quota-checked. Enforcement
  is one flag: `QUOTA_ENFORCED=1` on the prod deployment.
- **Billing:** Polar as merchant of record (they handle tax, receipts,
  refunds) via @convex-dev/polar. Runbook: web/docs/billing-setup.md.
  Family comps are 100% discount codes in the Polar dashboard, no code.
- **Trust surface:** /terms (bounded retention: two years post-lapse, then
  export-or-trim with three months emailed notice, wind-down clause) and
  /privacy (full data inventory, deletion within 30 days).
- **Ops:** hello@librium.dev receives via Cloudflare Email Routing
  catch-all. Password reset + verification email via Resend
  (web/docs/email-setup.md). Account deletion is one command:
  admin:deleteUserAccount. Daily cron: orphaned R2 object sweep. Sync
  tombstones remain until device acknowledgements can prove compaction safe.

### Remaining before ALLOW_SIGNUP=true (public launch)

1. Production Polar org (KYC + payout account) and the env swap:
   POLAR_ORGANIZATION_TOKEN / POLAR_WEBHOOK_SECRET / POLAR_PRODUCT_SUPPORTER
   / POLAR_SERVER=production on prod, then `billing:syncProducts --prod`
   (MANDATORY: without it a paying supporter resolves to free), then one
   real-card self-purchase as the smoke test.
2. `REQUIRE_EMAIL_VERIFICATION=true`.
3. The one bad combination to never ship: sandbox Polar + enforced quota +
   open signups (a stranger's real card bounces off a fake store). Any two
   of the three are safe.

## Deferred / future

- iOS PWA polish (install prompt, persistent-storage request, Safari eviction
  testing, mobile parse performance).
- Highlights + notes (ride the Phase 4 sync layer when added).
- One-click full export (books + progress as a zip) — durability escape hatch.
- ~~Web Worker parsing~~ — done (spine 0.4.0 removed the DOMParser dependency;
  Librium parses imports/seeding in a module worker since the spine 0.8.0
  upgrade).
- More formats (MOBI/AZW3/FB2) in `@abfcode/spine` — grows the OSS library and
  the reader together.
- "Send as" hello@librium.dev (Gmail send-as + SMTP relay) once real mail
  volume exists — receiving already works.
- Shared `runInWorkerWithFallback` helper (three hand-rolled copies: parse,
  export rewrite, text convert; the parse fallback logs an e2e-asserted
  marker — mind it when unifying) and a shared dialog-dismiss hook (six
  copied scaffolds; menus already share `useDismissable`).
- Denormalized per-user storage counter if libraries reach thousands of
  books (today's per-check summation is deliberate: it can't drift).
- ~~`@abfcode/spine` OSS hygiene~~ — done upstream (LICENSE, CI matrix incl.
  epubcheck, golden corpus shipped in spine 0.2–0.8).
