# Parser Output Contract (v1)

This document defines the JSON contract returned by the Go parser service
(`POST /parse`). The goal is a deterministic, stable payload that the web app
and Convex ingest can rely on.

## Endpoint

`POST /parse` (multipart form)

### Form fields
- `file` (required): `.epub` file

## Response (success)

```json
{
  "fileName": "book.epub",
  "fileSize": 123456,
  "message": "parsed",
  "sections": [
    { "title": "Chapter 1", "orderIndex": 0 }
  ],
  "chunks": [
    {
      "sectionOrderIndex": 0,
      "chunkIndex": 0,
      "startOffset": 0,
      "endOffset": 512,
      "wordCount": 120,
      "content": "Chunk text..."
    }
  ],
  "metadata": {
    "title": "Book Title",
    "authors": ["Author One"],
    "language": "en"
  },
  "warnings": [
    { "code": "spine", "message": "missing href", "path": "OEBPS/..." }
  ]
}
```

## Response fields

### Top-level
- `fileName`: original filename
- `fileSize`: bytes
- `message`: `"parsed"` or `"parsed with warnings: ..."`
- `sections`: ordered TOC/section list (flattened)
- `chunks`: deterministic content chunks
- `metadata`: extracted book metadata
- `warnings`: non-fatal parse issues

### `sections[]`
- `title`: display title
- `orderIndex`: stable ordering

### `chunks[]`
- `sectionOrderIndex`: index into `sections[]`
- `chunkIndex`: sequential index within a section
- `startOffset`, `endOffset`: offsets in section text space
- `wordCount`: simple word count
- `content`: plain text

### `metadata`
- `title`: canonical title
- `authors`: list of authors
- `language`: primary language code (if available)

### `warnings[]`
- `code`: short code (e.g., `spine`, `content`, `opf`)
- `message`: human-readable detail
- `path`: file path within EPUB if applicable

## Notes

- The parser may return `warnings` while still producing usable content.
- `sections` are flattened; nested TOC hierarchy is not yet represented.
- `content` is plain text; HTML structure is preserved in Spine internally but
  normalized for the reader pipeline.
