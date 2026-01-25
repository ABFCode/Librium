import { useState } from 'react'
import { useAction, useConvexAuth, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

export const useImportFlow = () => {
  const { isAuthenticated } = useConvexAuth()
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl)
  const importBook = useAction(api.imports.importBook)
  const [files, setFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [result, setResult] = useState<{
    fileName: string
    fileSize: number
    author: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const allowLocalAuth =
    import.meta.env.VITE_ALLOW_LOCAL_AUTH === 'true'
  const canUpload = isAuthenticated || allowLocalAuth
  const importJobs = useQuery(
    api.importJobs.listImportJobs,
    isAuthenticated || allowLocalAuth ? {} : 'skip',
  )

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

  const submit = async () => {
    if (files.length === 0) {
      setError('Select at least one EPUB file.')
      return
    }
    if (!isAuthenticated && !allowLocalAuth) {
      setError('Please sign in to upload books.')
      return
    }
    setIsUploading(true)
    setError(null)
    setResult(null)
    let hadFailure = false
    for (const file of files) {
      try {
        const uploadUrl = await generateUploadUrl({})
        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          body: file,
        })
        const uploadBody = await uploadResponse.json()
        if (!uploadBody?.storageId) {
          throw new Error('Upload failed: storageId missing.')
        }
        const storageId = uploadBody.storageId as string
        const result = await importBook({
          storageId,
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type || undefined,
        })
        if (!result?.bookId) {
          throw new Error('Import failed: book was not created.')
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : `Upload failed for ${file.name}`,
        )
        hadFailure = true
        continue
      }
      const author = 'Uploaded'
      const title = file.name
      setResult({
        fileName: title,
        fileSize: file.size,
        author,
      })
    }
    if (!hadFailure) {
      setFiles([])
    }
    setIsUploading(false)
  }

  const addFiles = (incoming: FileList | File[]) => {
    const next = Array.from(incoming).filter((file) =>
      file.name.toLowerCase().endsWith('.epub'),
    )
    if (next.length === 0) {
      setError('Only EPUB files are supported.')
      return
    }
    setFiles((prev) => {
      const seen = new Set(prev.map((file) => `${file.name}-${file.size}-${file.lastModified}`))
      const merged = [...prev]
      for (const file of next) {
        const key = `${file.name}-${file.size}-${file.lastModified}`
        if (seen.has(key)) {
          continue
        }
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
    allowLocalAuth,
    canUpload,
    statusLabel,
    submit,
    addFiles,
  }
}
