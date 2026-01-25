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
    { "title": "Chapter 1", "orderIndex": 0, "depth": 0 }
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
  "sectionBlocks": [
    {
      "sectionOrderIndex": 0,
      "blocks": [
        {
          "kind": "paragraph",
          "inlines": [{ "kind": "text", "text": "Hello" }]
        }
      ]
    }
  ],
  "metadata": {
    "title": "Book Title",
    "authors": ["Author One"],
    "language": "en"
  },
  "cover": {
    "contentType": "image/jpeg",
    "data": "BASE64_BYTES"
  },
  "images": [
    {
      "href": "OEBPS/images/cover.jpg",
      "contentType": "image/jpeg",
      "data": "BASE64_BYTES"
    }
  ],
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
- `sectionBlocks`: structured blocks per section (for rich rendering)
- `metadata`: extracted book metadata
- `cover`: optional cover image payload (base64)
- `images`: optional image resources referenced by content
- `warnings`: non-fatal parse issues

### `sections[]`
- `title`: display title
- `orderIndex`: stable ordering
- `depth`: nesting depth in the TOC
- `parentOrderIndex`: optional parent section index
- `href`: original href without anchor
- `anchor`: anchor fragment within the href

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

### `cover`
- `contentType`: MIME type for the image
- `data`: base64-encoded image bytes

### `sectionBlocks[]`
- `sectionOrderIndex`: index into `sections[]`
- `blocks`: array of block objects with inline content

Block payloads include:
- `kind`: `paragraph`, `heading`, `list_item`, `blockquote`, `pre`, `hr`, `table`, `figure`
- `level`: heading level (if heading)
- `ordered` / `listIndex`: list metadata (if list item)
- `inlines`: inline array for text, links, images
- `table` / `figure`: structured table or figure data
- `anchors`: anchor ids captured for the block

Inline payloads include:
- `kind`: `text`, `emphasis`, `strong`, `link`, `image`, `code`
- `text`, `href`, `src`, `alt`

### `images[]`
- `href`: resolved EPUB resource path for an image
- `contentType`: MIME type (best-effort)
- `data`: base64-encoded bytes

### `warnings[]`
- `code`: short code (e.g., `spine`, `content`, `opf`)
- `message`: human-readable detail
- `path`: file path within EPUB if applicable

## Notes

- The parser may return `warnings` while still producing usable content.
- `sections` are flattened; nested TOC hierarchy is not yet represented.
- `content` is plain text; HTML structure is preserved in Spine internally but
  normalized for the reader pipeline.
