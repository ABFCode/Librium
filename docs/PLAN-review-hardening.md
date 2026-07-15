# Librium Review Hardening Plan

*Written 2026-07-11 after an adversarial code review and local browser walkthrough.*

## Objective

Close the correctness, durability, privacy, offline-verification, security,
accessibility, mobile, and maintenance gaps found in the review without
weakening Librium's local-first reading model.

This work is complete only when the focused acceptance tests for every phase
pass, the actual app has been exercised in Chromium for that phase, and the
full review workflow passes after each large architectural change.

## Non-negotiable invariants

1. Reading cached content never requires the network.
2. A device wall clock never decides which synchronized mutation wins.
3. A stale offline mutation never silently overwrites server state it did not
   observe.
4. Every registered book is either durably backed by an attached master EPUB
   or visibly has a retryable pending-backup state.
5. Re-importing identical bytes is idempotent for one user.
6. Local content and user state are isolated by authenticated account.
7. Signing into account B never exposes or deletes account A's local cache.
8. Quota gates new cloud bytes only; it never blocks reading, export, retry of
   an already-counted attachment, or deletion.
9. Destructive dialogs are keyboard- and screen-reader-safe.
10. Offline claims are tested against a production build and service worker,
    not inferred from development-server behavior.

## Phase 1: server-authoritative sync conflicts

### Problem

Progress, explicit status, and collection renames currently send client
`Date.now()` values to Convex and compare those values across devices. A device
with a fast clock can dominate later edits indefinitely.

### Design

Use optimistic concurrency against per-field server versions:

- `userBooks.progressUpdatedAt` versions progress only.
- `userBooks.statusUpdatedAt` versions explicit status only.
- `collections.nameUpdatedAt` versions collection names only.
- A local mutation carries `baseServerTime`, the last version that device
  actually merged before making its local edit.
- The server accepts when its current field version is not newer than the
  supplied base. It stamps the accepted value with server `Date.now()` and
  returns `{ accepted, serverTime }`.
- If the current field version is newer, the server rejects without modifying
  the field. The client clears the rejected dirty flag and adopts the current
  reactive server value.
- Device `editedAt` remains local-only for coalescing writes made on the same
  device. It is never sent or compared across devices.

This prevents stale offline queues from overwriting observed-newer server
state. If two devices edit concurrently from the same base, the first accepted
server mutation wins; the loser visibly converges to it.

### Migration

The new version fields are optional. Existing rows fall back to the relevant
legacy server `updatedAt` until the first new mutation stamps the dedicated
field. No destructive data migration is required.

### Acceptance tests

- A client clock 24 hours ahead cannot dominate later progress/status/rename.
- A stale offline mutation based on version N is rejected after version N+1.
- Two edits from the same base produce one winner and both devices converge.
- Progress changes do not invalidate an offline status edit, and vice versa.
- A newer local edit made during an in-flight push remains dirty.

## Phase 2: idempotent, recoverable imports

### Problem

Registration happens before the master EPUB upload. A transient R2 failure
leaves a local/remote metadata row without `epubKey`, there is no upload retry,
and re-import creates a duplicate.

### Design

- Compute SHA-256 over the final EPUB bytes after text conversion.
- Add `books.contentHash` and a per-owner hash index.
- Replace unconditional registration with an idempotent register-or-resume
  mutation. Identical bytes return the existing book and whether its EPUB is
  already attached.
- Keep the raw EPUB in a per-account local `pendingUploads` table until
  `finalizeUpload` succeeds. Store retry status and the last user-facing error.
- Retry once when a pending row is discovered and on every online transition;
  expose an explicit **Retry backup** action without a background retry loop
  that would spam a failing endpoint. The UI distinguishes `Ready`, `Backing
  up`, and `Readable here — backup pending`.
- Delete the pending raw blob only after the server confirms attachment.
- Re-importing the same bytes resumes the existing pending upload instead of
  creating another book.

### Acceptance tests

- Abort the R2 PUT after registration: the book remains readable and visibly
  pending; reconnect retries and attaches the same book ID.
- Reload and browser restart preserve the retry queue.
- Import identical bytes twice: one server book, one R2 master, one local book.
- A quota rejection leaves neither a phantom server row nor a pending retry.
- Cover failure remains a non-fatal warning after the EPUB is attached.

## Phase 3: per-account local database

### Problem

All users share the origin-wide `librium` IndexedDB database. Remote
reconciliation for a newly signed-in account can purge the previous account's
cache, and direct reader URLs can consult local rows before ownership resolves.

### Design

- Resolve the stable Better Auth user ID before opening user data.
- Open `librium:<user-id>` (or prefix every key with user ID) through a database
  provider rather than exporting a process-global singleton.
- Keep non-sensitive device preferences, such as theme, outside the user DB.
- On upgrade, move the legacy `librium` database into the first authenticated
  user's namespace only after ownership is confirmed from the server. Never
  infer ownership while offline.
- Sign-out closes the active database and clears in-memory object URLs/state;
  it does not delete that account's cache.
- Reader content renders only from the active account namespace.

### Acceptance tests

- Account A imports and downloads a book; account B never sees it.
- Switching to B does not delete A's cache; switching back to A reads offline.
- A deep link to A's book while signed in as B never renders A's title/content.
- Dirty offline mutations remain scoped to their originating account.
- Legacy database migration is one-shot and recoverable if interrupted.

## Phase 4: real production-offline verification

Add a dedicated Playwright configuration that:

1. builds and serves `dist/`;
2. signs in and imports a fixture while online;
3. waits for the service worker to control the page;
4. closes the page to eliminate memory-cache false positives;
5. disables network access;
6. opens a fresh page at `/library` and then a reader deep link;
7. verifies chapter navigation, search of cached content, progress and bookmark
   writes while offline;
8. restores networking and verifies reconciliation.

Follow-up release experiment: verify that an old controlled tab continues
reading while a new service worker installs and activation does not reload
mid-chapter. This needs two distinct deployed asset revisions and is separate
from the deterministic cold-start acceptance workflow.

## Phase 5: remaining hardening

### Cover proxy

- Prefer an allowlist derived from enabled metadata providers.
- If arbitrary cover URLs remain supported, resolve and validate every address
  and pin the connection so DNS cannot change between validation and fetch.
- Preserve HTTPS-only, redirect-hop validation, MIME checks, byte caps, and
  authentication.

### Modal accessibility

- Create one shared modal primitive with `role="dialog"`, `aria-modal="true"`,
  labelled/described relationships, initial focus, focus trapping, Escape,
  backdrop dismissal, body scroll lock, and focus restoration.
- Migrate confirmation, account, reader preferences, edit-book, collection,
  and metadata dialogs.

### Mobile controls

- Give primary sort/status/filter chips at least a 44px coarse-pointer hit
  area without making the visual pills unnecessarily tall.
- Test 320, 375, 390, and 768px widths with touch enabled.

### Import memory

- Measure peak heap for representative 100MB and multi-thousand-chapter books
  before raising the current import-size expectations.
- Avoid the worker's full input structured-clone copy: snapshot an immutable
  upload Blob, transfer the EPUB buffer, and re-read the `File` only if the
  worker itself fails. Generated text EPUBs retain the fallback-safe clone.
- Keep imports sequential and release parsed payload references promptly.

### Documentation and tooling

- Correct README architecture, offline support, auth features, and version.
- Pin `packageManager` so Corepack never guesses from the network.
- Replace `vite-tsconfig-paths` with Vite's native `resolve.tsconfigPaths`.
- Fix the reader CSS specificity warning.

## Review workflow

After every major phase:

```bash
cd web
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

Additionally:

- run `tsc --noEmit`;
- run the phase's focused regression tests;
- exercise the changed journey in the actual local app with Chromium;
- inspect console/page errors and mobile overflow;
- confirm `git diff` contains no unrelated changes.

After Phases 1-3 and again at the end, repeat the adversarial review: auth and
ownership boundaries, offline/reconnect races, deletion/tombstone behavior,
quota failure paths, multi-account isolation, mobile interaction, production
PWA cold start, and large-book resource use.
