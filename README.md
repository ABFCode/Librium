# Librium — Personal Ebook Library & Reader

Librium is a performance‑focused web app for uploading, managing, and reading your personal EPUB library. It’s built as a modern, real‑time stack with a dedicated parser service.

## Stack

* **Web app:** TanStack Start + React 19 + Vite + Tailwind (`/web`)
* **Data/Auth:** Convex (with Better Auth) (`/web/convex`)
* **Parser:** Go microservice using Spine for EPUB parsing (`/parser`)
* **Storage:** Convex Storage (EPUBs, section text, and assets)

## Features (current)

* **Auth:** Email/password sign‑in + sign‑up
* **Import:** Upload EPUBs, async parsing + ingest
* **Library:** Covers, title/author, download, delete
* **Reader:** TOC, next/prev, arrow keys, bookmarks, search
* **Reader prefs:** Font size, line height, content width, theme
* **Progress:** Remembers last section + scroll position

## Quick start (dev)

1) Start the parser:
```
cd parser
go run ./main.go
```

2) Start Convex:
```
cd web
pnpm dlx convex dev
```

3) Start the web app:
```
cd web
pnpm dev
```

The parser defaults to `http://localhost:8081/parse`. Override with `PARSER_URL` if needed.

## Resetting dev data

```
make convex-reset CONFIRM=RESET
```

## Status

Active development. Expect breaking changes while the new stack stabilizes.

## License

Apache License 2.0. See `LICENSE`.
