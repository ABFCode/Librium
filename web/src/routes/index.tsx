import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import '../App.css'
import { useLocalUser } from '../hooks/useLocalUser'

export const Route = createFileRoute('/')({ component: App })

function App() {
  const userId = useLocalUser()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<unknown | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const submit = async () => {
    if (!file) {
      setError('Select an EPUB file first.')
      return
    }
    if (!userId) {
      setError('User not ready yet.')
      return
    }
    setIsUploading(true)
    setError(null)
    setResult(null)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('userId', userId)
    const response = await fetch('/api/import', {
      method: 'POST',
      body: formData,
    })
    const body = await response.json()
    if (!response.ok) {
      setError(body?.error ?? 'Upload failed')
    } else {
      setResult(body)
    }
    setIsUploading(false)
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>Librium Import</h1>
        <p>Upload an EPUB to run through the parser service.</p>
        <input
          type="file"
          accept=".epub,application/epub+zip"
          onChange={(event) =>
            setFile(event.target.files?.[0] ?? null)
          }
        />
        <button
          className="App-link"
          onClick={submit}
          disabled={isUploading || !file}
        >
          {isUploading ? 'Uploading...' : 'Import EPUB'}
        </button>
        {error ? <p>{error}</p> : null}
        {result ? (
          <pre>{JSON.stringify(result, null, 2)}</pre>
        ) : null}
      </header>
    </div>
  )
}
