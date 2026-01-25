import { useState } from 'react'
import { useConvexAuth, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useLocalUser } from './useLocalUser'

export const useImportFlow = () => {
  const { isAuthenticated } = useConvexAuth()
  const userId = useLocalUser()
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
    for (const file of files) {
      const formData = new FormData()
      formData.append('file', file)
      if (userId) {
        formData.append('userId', userId)
      }
      const response = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      })
      const body = await response.json()
      if (!response.ok) {
        setError(body?.error ?? `Upload failed for ${file.name}`)
        continue
      }
      const author = 'Uploaded'
      const title = body?.fileName ?? file.name
      setResult({
        fileName: title,
        fileSize: body?.parser?.fileSize ?? file.size,
        author,
      })
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
    setFiles((prev) => [...prev, ...next])
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
    statusLabel,
    submit,
    addFiles,
  }
}
