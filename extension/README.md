# Librium — NovelUpdates Clipper

One-click companion extension for Librium's NovelUpdates linking. On any
`novelupdates.com/series/…` page, click the **extension's toolbar icon** (pin
it!) — it copies the page HTML **and the cover image** as a single JSON
payload. Paste (Ctrl+V) into Librium's *Edit details* dialog and every field
plus the cover fills at once.

**Trigger it via the extension's own UI — right-click → "Copy to Librium",
or the toolbar icon.** Cloudflare 403s every out-of-page fetch of the cover
(even the extension's background fetch — the clearance cookie is
partition-bound) and CORS blocks page-context reads, so the cover is obtained
by **screenshotting the rendered page** and cropping. Browsers only permit
that under the `activeTab` grant, which is handed out exclusively for clicks
on extension UI (context-menu entry, toolbar icon, keyboard shortcut). The
floating button (bottom-right) is page UI, so it can never carry that grant —
it copies without the cover on a fresh tab (capture rights linger only after
an extension-UI click on that tab).

Why an extension at all: Cloudflare 403s every server-side fetch of
NovelUpdates — pages *and* the image CDN — so the data has to travel through
a real browser session. This packages that trip into one click.

## Install — Firefox

Firefox only permanently installs **signed** extensions, so pick one:

- **Temporary (quickest, resets on restart):** `about:debugging` → *This
  Firefox* → *Load Temporary Add-on…* → pick `extension/manifest.json`.
- **Permanent:** sign it once, free, via Mozilla's unlisted channel:
  `npx web-ext sign --channel=unlisted --api-key=… --api-secret=…`
  (keys from https://addons.mozilla.org/developers/addon/api/key/), then
  install the produced `.xpi`.

Firefox treats MV3 host permissions as **opt-in**: after installing, open
`about:addons` → this extension → *Permissions* tab → enable access to
novelupdates.com, or the cover fetch will silently fail (the button then
reports "Copied (no cover)").

## Install — Chrome / Edge

`chrome://extensions` → enable *Developer mode* → *Load unpacked* → select
this `extension/` folder.

## Notes

- Payload contract: `{ librium: 1, sourceUrl, html, coverDataUrl?,
  coverError? }` — consumed by `web/src/lib/novelUpdates.ts`
  (`parseLibriumPayload`; `coverError` is diagnostic-only and ignored by the
  app). Bump the version field on any shape change.
- Cover path: screenshot-crop of the rendered cover only. Fetch-based
  attempts were live-tested dead and deleted in v0.2.1 (background fetch:
  Cloudflare 403s out-of-partition requests even with credentials; page
  fetch: the CDN sends no CORS headers) — see git history (v0.1.x) if NU
  ever relaxes and a full-quality download becomes worth re-adding.
- Host access is scoped to `novelupdates.com` + `cdn.novelupdates.com`; the
  extension reads nothing else and talks to no server — output goes only to
  your clipboard.
