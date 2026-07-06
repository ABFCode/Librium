import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { api } from '../../convex/_generated/api'
import { db, type LocalProgress } from '../lib/db'

// Local-first reading progress with LWW sync (ROADMAP Phase 4).
//
// Rules (see ROADMAP.md "Sync design"):
// - Every edit is written to IndexedDB first (instant, offline-capable) and
//   marked dirty.
// - Dirty records push to Convex when a connection exists. The server rejects
//   pushes older (by editedAt) than what it already has, so a reconnecting
//   device cannot clobber newer progress with a stale queued write.
// - Pull ordering never compares device clocks against the server clock: a
//   remote record is adopted only if its server updatedAt is newer than the
//   last server state this device merged (syncedServerTime) — and never over
//   unpushed local edits.

export type EffectiveProgress = {
  sectionIndex: number
  blockIndex: number
  blockOffset: number
  sectionFraction: number
  source: 'local' | 'remote'
}

type UseProgressSyncArgs = {
  bookId: string
  canQuery: boolean
}

export function useProgressSync({ bookId, canQuery }: UseProgressSyncArgs) {
  const updateProgress = useMutation(api.userBooks.updateProgress)
  const remote = useQuery(
    api.userBooks.getUserBook,
    canQuery ? { bookId: bookId as never } : 'skip',
  )
  // undefined = still loading; null = no local record.
  const local = useLiveQuery(
    async () => ((await db.progress.get(bookId)) ?? null) as LocalProgress | null,
    [bookId],
  )

  const remoteRecord: LocalProgress | null = useMemo(() => {
    if (!remote) {
      return null
    }
    return {
      bookId,
      sectionIndex: remote.lastSectionIndex ?? 0,
      blockIndex: remote.lastBlockIndex ?? 0,
      blockOffset: remote.lastBlockOffset ?? 0,
      sectionFraction: remote.lastSectionFraction ?? 0,
      editedAt: remote.progressEditedAt ?? remote.updatedAt ?? 0,
      dirty: 0,
      syncedServerTime: remote.updatedAt ?? 0,
    }
  }, [remote, bookId])

  // The merged view the reader should restore from. Computed in memory so the
  // reader never waits on an IndexedDB round-trip after a remote merge.
  const effectiveProgress: EffectiveProgress | null | undefined = useMemo(() => {
    if (local === undefined) {
      return undefined
    }
    if (canQuery && remote === undefined) {
      // Online with the remote copy still loading — brief wait, mirrors the
      // pre-existing "Restoring" gate. Offline (canQuery false) skips this.
      return undefined
    }
    let pick: 'local' | 'remote' | null
    if (!local) {
      pick = remoteRecord ? 'remote' : null
    } else if (local.dirty) {
      pick = 'local'
    } else if (
      remoteRecord &&
      remoteRecord.syncedServerTime > local.syncedServerTime
    ) {
      pick = 'remote'
    } else {
      pick = 'local'
    }
    if (pick === null) {
      return null
    }
    const rec = pick === 'remote' ? remoteRecord! : local!
    return {
      sectionIndex: rec.sectionIndex,
      blockIndex: rec.blockIndex,
      blockOffset: rec.blockOffset,
      sectionFraction: rec.sectionFraction ?? 0,
      source: pick,
    }
  }, [local, remoteRecord, remote, canQuery])

  // Persist adopted remote state so it survives going offline.
  useEffect(() => {
    if (!remoteRecord || local === undefined) {
      return
    }
    if (
      local &&
      (local.dirty || remoteRecord.syncedServerTime <= local.syncedServerTime)
    ) {
      return
    }
    void db.progress.put(remoteRecord).catch(() => {})
  }, [remoteRecord, local])

  // Push dirty local edits to the server (fires on edit and on reconnect).
  const pushingRef = useRef(false)
  useEffect(() => {
    if (!canQuery || !local || !local.dirty || pushingRef.current) {
      return
    }
    pushingRef.current = true
    const editedAt = local.editedAt
    void updateProgress({
      bookId: bookId as never,
      lastSectionIndex: local.sectionIndex,
      lastBlockIndex: local.blockIndex,
      lastBlockOffset: local.blockOffset,
      lastSectionFraction: local.sectionFraction ?? 0,
      editedAt,
    })
      .then(async () => {
        await db.progress
          .where('bookId')
          .equals(bookId)
          .modify((p) => {
            // Only clear dirty if no newer local edit happened meanwhile.
            if (p.editedAt <= editedAt) {
              p.dirty = 0
            }
          })
      })
      .catch(() => {
        // Offline or transient — retried on the next edit or reconnect.
      })
      .finally(() => {
        pushingRef.current = false
      })
  }, [canQuery, local, bookId, updateProgress])

  const saveProgress = useCallback(
    async (args: {
      sectionIndex: number
      blockIndex: number
      blockOffset: number
      sectionFraction?: number
    }) => {
      try {
        const existing = await db.progress.get(bookId)
        await db.progress.put({
          bookId,
          sectionIndex: args.sectionIndex,
          blockIndex: args.blockIndex,
          blockOffset: args.blockOffset,
          sectionFraction: args.sectionFraction ?? 0,
          editedAt: Date.now(),
          dirty: 1,
          syncedServerTime: existing?.syncedServerTime ?? 0,
        })
      } catch {
        // IndexedDB unavailable — nothing durable to write.
      }
    },
    [bookId],
  )

  return { effectiveProgress, saveProgress }
}
