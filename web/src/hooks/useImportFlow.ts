import { useState } from 'react'
import { useConvexAuth, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { parseEpubToPayload } from '../lib/epub'
import { payloadToLocalBookInput } from '../lib/localBook'
import { saveImportedBook } from '../lib/db'

export type ImportResult = {
  fileName: string
  fileSize: number
  author: string
}

export const useImportFlow = () => {
  const { isAuthenticated } = useConvexAuth()
  const registerImport = useMutation(api.books.registerImport)
  const attachFiles = useMutation(api.books.attachFiles)
  const generateBookUploadUrl = useMutation(api.books.generateBookUploadUrl)
  const syncMetadata = useMutation(api.r2.syncMetadata)

  // Direct-to-R2 upload under a structured key (books/{bookId}/…).
  const uploadToR2 = async (
    bookId: string,
    kind: 'epub' | 'cover',
    blob: Blob,
  ): Promise<string> => {
    const { url, key } = await generateBookUploadUrl({
      bookId: bookId as never,
      kind,
    })
    const res = await fetch(url, {
      method: 'PUT',
      headers: blob.type ? { 'Content-Type': blob.type } : undefined,
      body: blob,
    })
    if (!res.ok) {
      throw new Error(`Upload failed (${kind})`)
    }
    await syncMetadata({ key })
    return key
  }
  const [files, setFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [completed, setCompleted] = useState<ImportResult[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const importOne = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer())

    // Parse entirely in the browser (native DOMParser + fflate).
    const payload = parseEpubToPayload(bytes)
    const m = payload.metadata

    // Register metadata first — the book exists (and is readable locally,
    // below) before any blob upload starts.
    const bookId = (await registerImport({
      fileName: file.name,
      fileSize: file.size,
      sectionCount: payload.sections.length,
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
    })) as unknown as string

    // Local-first: the parsed book lands in IndexedDB immediately.
    try {
      await saveImportedBook(payloadToLocalBookInput(bookId, payload))
    } catch {
      // IndexedDB unavailable — the R2 backup below still works.
    }

    // Backup the master copy (raw EPUB + cover) to R2, then attach the keys.
    const epubKey = await uploadToR2(
      bookId,
      'epub',
      new Blob([bytes as BlobPart], { type: 'application/epub+zip' }),
    )
    let coverKey: string | undefined
    if (payload.cover) {
      const coverType = payload.cover.contentType || 'image/jpeg'
      coverKey = await uploadToR2(
        bookId,
        'cover',
        new Blob([payload.cover.bytes as BlobPart], { type: coverType }),
      )
    }
    await attachFiles({ bookId: bookId as never, epubKey, coverKey })

    return {
      fileName: m.title || file.name,
      fileSize: file.size,
      author: (m.authors ?? []).join(', ') || 'Unknown',
    }
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
        setResult(res)
        setCompleted((prev) => [res, ...prev])
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
    completed,
    error,
    setError,
    isUploading,
    isAuthenticated,
    submit,
    addFiles,
  }
}
