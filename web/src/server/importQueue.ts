import { ConvexHttpClient } from 'convex/browser'

type ImportTask = {
  importJobId: string
  userId: string
  fileName: string
  fileSize: number
  contentType?: string
  storageId: string
}

let processing = false
const queue: ImportTask[] = []

export const enqueueImport = (
  task: ImportTask,
  convexUrl: string,
  parserUrl: string,
) => {
  queue.push(task)
  if (!processing) {
    void processQueue(convexUrl, parserUrl)
  }
}

export const enqueueImportByJob = async (
  importJobId: string,
  convexUrl: string,
  parserUrl: string,
) => {
  const convex = new ConvexHttpClient(convexUrl)
  const job = await convex.query('importJobs:getImportJob', {
    importJobId,
  })
  if (!job?.storageId) {
    await convex.mutation('importJobs:updateImportJobStatus', {
      importJobId,
      status: 'failed',
      errorMessage: 'Missing stored file',
    })
    return
  }

  enqueueImport(
    {
      importJobId: job._id,
      userId: job.userId,
      fileName: job.fileName,
      fileSize: job.fileSize,
      contentType: job.contentType ?? undefined,
      storageId: job.storageId,
    },
    convexUrl,
    parserUrl,
  )
}

const processQueue = async (convexUrl: string, parserUrl: string) => {
  processing = true
  const convex = new ConvexHttpClient(convexUrl)

  while (queue.length > 0) {
    const task = queue.shift()
    if (!task) {
      continue
    }

    await convex.mutation('importJobs:updateImportJobStatus', {
      importJobId: task.importJobId,
      status: 'parsing',
    })

    try {
      const fileUrl = await convex.mutation('storage:getFileUrl', {
        storageId: task.storageId,
      })
      if (!fileUrl) {
        await convex.mutation('importJobs:updateImportJobStatus', {
          importJobId: task.importJobId,
          status: 'failed',
          errorMessage: 'Missing stored file',
        })
        continue
      }

      const fileResponse = await fetch(fileUrl)
      if (!fileResponse.ok) {
        await convex.mutation('importJobs:updateImportJobStatus', {
          importJobId: task.importJobId,
          status: 'failed',
          errorMessage: 'Failed to download stored file',
        })
        continue
      }

      const fileData = await fileResponse.arrayBuffer()
      const formData = new FormData()
      const blob = new Blob([fileData], {
        type: task.contentType ?? 'application/epub+zip',
      })
      formData.append('file', blob, task.fileName)

      const response = await fetch(parserUrl, {
        method: 'POST',
        body: formData,
      })
      const body = await response.json()

      if (!response.ok) {
        await convex.mutation('importJobs:updateImportJobStatus', {
          importJobId: task.importJobId,
          status: 'failed',
          errorMessage: body?.error ?? 'Parser error',
        })
        continue
      }

      await convex.mutation('importJobs:updateImportJobStatus', {
        importJobId: task.importJobId,
        status: 'ingesting',
      })

      const meta = body?.metadata ?? {}
      const parsedTitle =
        meta?.title || task.fileName.replace(/\.epub$/i, '')
      const authorList = Array.isArray(meta?.authors)
        ? meta.authors
        : []
      const author =
        authorList.length > 0 ? authorList.join(', ') : undefined
      const language = meta?.language || undefined

      const bookId = await convex.mutation('books:createBook', {
        ownerId: task.userId,
        title: parsedTitle,
        author,
        language,
        publisher: meta?.publisher || undefined,
        publishedAt: meta?.publishedAt || undefined,
        series: meta?.series || undefined,
        seriesIndex: meta?.seriesIndex || undefined,
        subjects: Array.isArray(meta?.subjects) ? meta.subjects : undefined,
        identifiers: Array.isArray(meta?.identifiers)
          ? meta.identifiers
          : undefined,
      })

      await convex.mutation('userBooks:upsertUserBook', {
        userId: task.userId,
        bookId,
      })

      if (body?.sections && body?.chunks) {
        await convex.mutation('ingest:ingestParsedBook', {
          bookId,
          sections: body.sections,
          chunks: body.chunks,
        })
      }

      await convex.mutation('importJobs:updateImportJobStatus', {
        importJobId: task.importJobId,
        status: 'completed',
        bookId,
      })
    } catch (error) {
      await convex.mutation('importJobs:updateImportJobStatus', {
        importJobId: task.importJobId,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Import failed',
      })
    }
  }

  processing = false
}
