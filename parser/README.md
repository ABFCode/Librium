Librium Parser Service
======================

This service will host the Go-based EPUB parser and expose a stable API contract
for ingestion and canonical output generation.

Quick start:

- `go run ./main.go`
- Health check: `curl http://localhost:8081/health`
- Parse endpoint (stub):
  - `curl -X POST -F "file=@/path/to/book.epub" http://localhost:8081/parse`

Next steps:
- Define the request/response contract for `/parse`
- Implement streaming EPUB ingestion and canonical output generation
