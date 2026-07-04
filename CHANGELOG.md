# Changelog

## 0.1.0 - 2026-01-26

- New TanStack Start + Convex stack with Better Auth (email/password).
- EPUB import pipeline with parser service integration and Convex storage.
- Library view with covers, sorting, search, and protected actions.
- Reader experience with TOC, next/prev, bookmarks, and preferences.
- Progress tracking and resume support.
- Added browser tests (Vitest Browser Mode) and Playwright smoke tests.

  ## 0.1.1 - 2026-01-26
  - Remove unused template files/assets (benchmarks, TanStack scaffolding, sample logos).
  - Clean up .gitignore.

## 0.1.2 - 2026-07-03
- Upgrade all web dependencies to latest; npm audit vulnerabilities cleared (44 → 0), including better-auth 1.6 + Convex adapter 0.12, Convex 1.42, Vite 8, TanStack Start/Router 1.168, and TypeScript 6.
- Upgrade the Go parser: toolchain go 1.25.11 (stdlib CVE fixes), Spine 0.3.1, and golang.org/x/* to latest; govulncheck clean (19 → 0).
- Minor fixes surfaced by the upgrade: remove deprecated tsconfig `baseUrl`, add the missing default export on the library route, and match Convex functions by name in the Library test mock.