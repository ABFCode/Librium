import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { api } from '../../convex/_generated/api'
import { db } from '../lib/db'

// Local-first bookmarks with tombstone sync (ROADMAP Phase 4).
//
// - Create/delete write to IndexedDB first (instant, offline-capable) and
//   mark the row dirty.
// - Dirty creates push via an idempotent mutation (clientKey), dirty deletes
//   push as server tombstones — so a delete on one device propagates instead
//   of being resurrected by another device's copy.
// - Merge adopts remote rows (matching by convexId, then clientKey), applies
//   remote tombstones, and purges local rows whose server row disappeared.

type UseBookmarkSyncArgs = {
  bookId: string
  canQuery: boolean
  // Convex section id for a section index (null while unknown).
  resolveSectionId: (sectionIndex: number) => string | null
  // Section index for a Convex section id (null if unknown) — used for
  // legacy remote rows that lack sectionIndex.
  sectionIndexOf: (convexSectionId: string) => number | null
}

export function useBookmarkSync({
  bookId,
  canQuery,
  resolveSectionId,
  sectionIndexOf,
}: UseBookmarkSyncArgs) {
  const createRemote = useMutation(api.bookmarks.createBookmark)
  const deleteRemote = useMutation(api.bookmarks.deleteBookmark)
  const remote = useQuery(
    api.bookmarks.listByUserBook,
    canQuery ? { bookId: bookId as never } : 'skip',
  )
  const localAll = useLiveQuery(
    () => db.bookmarks.where('bookId').equals(bookId).toArray(),
    [bookId],
  )

  // What the UI renders: live (non-tombstoned) rows, oldest first.
  const bookmarks = useMemo(() => {
    if (localAll === undefined) {
      return undefined
    }
    return localAll
      .filter((b) => !b.deletedAt)
      .sort((a, b) => a.createdAt - b.createdAt)
  }, [localAll])

  // Merge remote state into the local store.
  useEffect(() => {
    if (!remote || localAll === undefined) {
      return
    }
    void (async () => {
      const byConvexId = new Map(
        localAll.filter((l) => l.convexId).map((l) => [l.convexId!, l]),
      )
      const byClientKey = new Map(localAll.map((l) => [l.clientKey, l]))
      const remoteIds = new Set<string>()
      for (const r of remote) {
        remoteIds.add(r._id as string)
        const local =
          byConvexId.get(r._id as string) ??
          (r.clientKey ? byClientKey.get(r.clientKey) : undefined)
        try {
          if (r.deletedAt) {
            // Remote tombstone: drop any local copy (dirty deletes of the
            // same row are also settled — the server already deleted it).
            if (local) {
              await db.bookmarks.delete(local.clientKey)
            }
            continue
          }
          if (!local) {
            const sectionIndex =
              r.sectionIndex ?? sectionIndexOf(r.sectionId as string)
            if (sectionIndex === null) {
              continue
            }
            await db.bookmarks.put({
              clientKey: r.clientKey ?? `remote:${r._id}`,
              bookId,
              sectionIndex,
              blockIndex: r.blockIndex,
              offset: r.offset,
              label: r.label ?? undefined,
              createdAt: r.createdAt,
              dirty: 0,
              convexId: r._id as string,
            })
            continue
          }
          if (!local.convexId) {
            // Our offline create landed (matched by clientKey) — record the
            // id; keep dirty if a delete is still pending for it.
            await db.bookmarks.update(local.clientKey, {
              convexId: r._id as string,
              dirty: local.deletedAt ? 1 : 0,
            })
          }
        } catch {
          // IndexedDB hiccup — retried on the next merge.
        }
      }
      // Local rows that reference a server row that no longer exists
      // (hard-deleted/compacted): purge. Rows without a convexId are pending
      // creates — unless they are tombstoned creates that never landed.
      for (const l of localAll) {
        try {
          if (l.convexId && !remoteIds.has(l.convexId)) {
            await db.bookmarks.delete(l.clientKey)
          } else if (!l.convexId && l.deletedAt) {
            const landed = remote.some((r) => r.clientKey === l.clientKey)
            if (!landed) {
              await db.bookmarks.delete(l.clientKey)
            }
          }
        } catch {
          // Retried on the next merge.
        }
      }
    })()
  }, [remote, localAll, bookId, sectionIndexOf])

  // Push dirty rows (fires on edit and on reconnect).
  const pushingRef = useRef(false)
  useEffect(() => {
    if (!canQuery || !localAll || pushingRef.current) {
      return
    }
    const dirty = localAll.filter((l) => l.dirty)
    if (dirty.length === 0) {
      return
    }
    pushingRef.current = true
    void (async () => {
      for (const l of dirty) {
        try {
          if (l.deletedAt) {
            if (l.convexId) {
              await deleteRemote({ bookmarkId: l.convexId as never })
              await db.bookmarks.delete(l.clientKey)
            }
            // No convexId: an unacknowledged create — the merge pass settles
            // it once the server list confirms whether it landed.
            continue
          }
          const sectionId = resolveSectionId(l.sectionIndex)
          if (!sectionId) {
            continue // Convex id not backfilled yet — retried later.
          }
          const id = await createRemote({
            bookId: bookId as never,
            sectionId: sectionId as never,
            sectionIndex: l.sectionIndex,
            blockIndex: l.blockIndex,
            offset: l.offset,
            label: l.label,
            clientKey: l.clientKey,
            createdAt: l.createdAt,
          })
          await db.bookmarks.update(l.clientKey, {
            convexId: id as unknown as string,
            dirty: 0,
          })
        } catch {
          // Offline or transient — retried on the next change/reconnect.
        }
      }
    })().finally(() => {
      pushingRef.current = false
    })
  }, [canQuery, localAll, bookId, resolveSectionId, createRemote, deleteRemote])

  const createBookmark = useCallback(
    async (args: {
      sectionIndex: number
      blockIndex: number
      offset: number
      label?: string
    }) => {
      try {
        await db.bookmarks.put({
          clientKey: crypto.randomUUID(),
          bookId,
          sectionIndex: args.sectionIndex,
          blockIndex: args.blockIndex,
          offset: args.offset,
          label: args.label,
          createdAt: Date.now(),
          dirty: 1,
        })
      } catch {
        // IndexedDB unavailable — nothing durable to write.
      }
    },
    [bookId],
  )

  const deleteBookmark = useCallback(async (clientKey: string) => {
    try {
      const row = await db.bookmarks.get(clientKey)
      if (!row) {
        return
      }
      // Tombstone locally; the push effect propagates it. (Rows the server
      // never saw are settled by the merge pass.)
      await db.bookmarks.update(clientKey, {
        deletedAt: Date.now(),
        dirty: 1,
      })
    } catch {
      // IndexedDB unavailable.
    }
  }, [])

  return { bookmarks, createBookmark, deleteBookmark }
}
