# Outbound email (Resend)

Transactional auth mail only: password resets and email verification.
Sends go through the official `@convex-dev/resend` component (durable
queue, exactly-once). Env-gated: no `RESEND_API_KEY` means sends are
skipped with a logged warning and every auth flow still works.

## Setup (done 2026-07-10)

1. Resend account (free tier), domain `librium.dev` added and verified —
   DKIM/SPF records live on subdomains, so they coexist with Cloudflare
   Email Routing's inbound MX on the root.
2. `npx convex env set RESEND_API_KEY <key>` on dev and `--prod`.
3. Sender defaults to `Librium <hello@librium.dev>`; override with
   `EMAIL_FROM` if it ever changes.

## Flags

- `REQUIRE_EMAIL_VERIFICATION=true` makes new signups verify before
  signing in. Leave unset until public signups open (existing accounts
  never signed up with verification and must not lock out).

## Deliverability rules

Reset and verification mail is the highest-deliverability category there
is, provided the domain stays clean: authenticated (DKIM/SPF via Resend,
DMARC recommended), low volume, and NOTHING promotional. Never send
newsletters or announcements from this domain.

## Debugging

- Resend dashboard → Emails shows every send and its delivery status.
- A missing key logs `[librium] RESEND_API_KEY unset; skipped …` in the
  Convex logs.
- Reset links expire after an hour and are single-use; the
  `/reset-password` page handles expired/used tokens with a link to
  request a fresh one.
