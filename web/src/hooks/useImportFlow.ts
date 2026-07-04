import { useState } from 'react'
import { useAction, useConvexAuth, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { parseEpubToPayload } from '../lib/epub'
import { contentTypeFromHref } from '@abfcode/spine'

const SECTION_BATCH = 50

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export const useImportFlow = () => {
  const { isAuthenticated } = useConvexAuth()
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl)
  const startImport = useMutation(api.ingest.startImport)
  const ingestSectionsBatch = useAction(api.ingest.ingestSectionsBatch)
  const finalizeImport = useMutation(api.ingest.finalizeImport)
  const failImport = useMutation(api.ingest.failImport)
  const [files, setFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [result, setResult] = useState<{ fileName: string; fileSize: number; author: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const importJobs = useQuery(api.importJobs.listImportJobs, isAuthenticated ? {} : 'skip')

  const statusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Ready'
      case 'failed':
        return 'Failed'
      case 'ingesting':
      case 'parsing':
        return 'Processing'
      case 'queued':
      default:
        return 'Queued'
    }
  }

  const uploadBlob = async (blob: Blob): Promise<string> => {
    const url = await generateUploadUrl({})
    const res = await fetch(url, {
      method: 'POST',
      headers: blob.type ? { 'Content-Type': blob.type } : undefined,
      body: blob,
    })
    const body = await res.json()
    if (!res.ok || !body?.storageId) throw new Error('Upload failed')
    return body.storageId as string
  }

  const importOne = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer())

    // Parse entirely in the browser (native DOMParser + fflate).
    const payload = parseEpubToPayload(bytes)

    // Upload the raw EPUB (kept for the download feature) + cover + images.
    const rawStorageId = await uploadBlob(new Blob([bytes as BlobPart], { type: 'application/epub+zip' }))

    let coverStorageId: string | undefined
    let coverContentType: string | undefined
    if (payload.cover) {
      coverContentType = payload.cover.contentType || 'image/jpeg'
      coverStorageId = await uploadBlob(new Blob([payload.cover.bytes as BlobPart], { type: coverContentType }))
    }

    const images: {
      href: string
      storageId: string
      contentType?: string
      byteSize?: number
    }[] = []
    for (const batch of chunk(payload.images, 8)) {
      const uploaded = await Promise.all(
        batch.map(async (img) => {
          const ct = img.contentType || contentTypeFromHref(img.href) || 'application/octet-stream'
          const storageId = await uploadBlob(new Blob([img.bytes as BlobPart], { type: ct }))
          return { href: img.href, storageId, contentType: ct, byteSize: img.bytes.length }
        }),
      )
      images.push(...uploaded)
    }

    const m = payload.metadata
    const { bookId, importJobId } = await startImport({
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type || undefined,
      rawStorageId: rawStorageId as never,
      metadata: {
        title: m.title,
        author: m.authors && m.authors.length > 0 ? m.authors.join(', ') : undefined,
        language: m.language,
        publisher: m.publisher,
        publishedAt: m.publishedAt,
        series: m.series,
        seriesIndex: m.seriesIndex,
        subjects: m.subjects,
        identifiers: m.identifiers,
      },
      coverStorageId: coverStorageId as never,
      coverContentType,
      images: images as never,
    })

    try {
      const blocksBySection = new Map(payload.sectionBlocks.map((sb) => [sb.sectionOrderIndex, sb.blocks]))
      const sectionArgs = payload.sections.map((s) => ({
        title: s.title,
        orderIndex: s.orderIndex,
        depth: s.depth,
        href: s.href,
        anchor: s.anchor,
        blocksJson: JSON.stringify(blocksBySection.get(s.orderIndex) ?? []),
      }))
      for (const batch of chunk(sectionArgs, SECTION_BATCH)) {
        await ingestSectionsBatch({ bookId, sections: batch })
      }
      await finalizeImport({ bookId, sectionCount: payload.sections.length, importJobId })
    } catch (err) {
      await failImport({ importJobId, errorMessage: err instanceof Error ? err.message : 'Ingest failed' })
      throw err
    }

    return { bookId, title: payload.metadata.title, author: (payload.metadata.authors ?? []).join(', ') }
  }

  const submit = async () => {
    if (files.length === 0) {
      setError('Select at least one EPUB file.')
      return
    }
    if (!isAuthenticated) {
      setError('Please sign in to upload books.')
      return
    }
    setIsUploading(true)
    setError(null)
    setResult(null)
    let hadFailure = false
    for (const file of files) {
      try {
        const res = await importOne(file)
        setResult({ fileName: res.title || file.name, fileSize: file.size, author: res.author || 'Unknown' })
      } catch (err) {
        setError(err instanceof Error ? err.message : `Import failed for ${file.name}`)
        hadFailure = true
      }
    }
    if (!hadFailure) setFiles([])
    setIsUploading(false)
  }

  const addFiles = (incoming: FileList | File[]) => {
    const next = Array.from(incoming).filter((file) => file.name.toLowerCase().endsWith('.epub'))
    if (next.length === 0) {
      setError('Only EPUB files are supported.')
      return
    }
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}-${f.size}-${f.lastModified}`))
      const merged = [...prev]
      for (const file of next) {
        const key = `${file.name}-${file.size}-${file.lastModified}`
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(file)
      }
      return merged
    })
  }

  return {
    files,
    setFiles,
    isDragging,
    setIsDragging,
    result,
    error,
    setError,
    isUploading,
    importJobs,
    isAuthenticated,
    statusLabel,
    submit,
    addFiles,
  }
}
