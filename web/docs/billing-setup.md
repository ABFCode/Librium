# Billing setup runbook (Polar)

The code ships with billing **off**: no `POLAR_*` env vars → every billing
surface degrades to the free plan, and no `QUOTA_ENFORCED` → uploads are
unlimited (current behavior). Nothing below blocks deploying the code.

## 1. Create the Polar org (sandbox first)

1. Sign up at https://sandbox.polar.sh (sandbox is a fully separate
   environment with fake payments — test cards like `4242 4242 4242 4242`).
2. Create an organization (e.g. `librium`).
3. Create one product: **Librium Supporter**, recurring, yearly, $12/year.
   Copy its **product ID**.
4. Settings → create an **Organization Access Token**. Copy it.

## 2. Wire the Convex deployment

Target the **production** Convex deployment even for the sandbox phase: the
dev deployment is a local backend with no public URL, so Polar's webhooks
can't reach it. This is safe — sandbox Polar can't charge real cards, and
quota enforcement stays off until step 4. Leave POLAR_* unset on the dev
deployment entirely (billing UI hides itself there).

```sh
cd web
npx convex env set --prod POLAR_ORGANIZATION_TOKEN <token>
npx convex env set --prod POLAR_PRODUCT_SUPPORTER <product-id>
npx convex env set --prod POLAR_SERVER sandbox
```

Webhook (subscription state reaches Convex ONLY via this — checkout will
"succeed" but the plan won't flip without it):

1. Polar dashboard → Settings → Webhooks → Add endpoint.
2. URL: `<your Convex site URL>/polar/events`
   (the `.convex.site` URL of the deployment, not `.convex.cloud`).
3. Format: **Raw**. Select at least the `subscription.*` and `product.*`
   events (all events is fine).
4. Copy the endpoint secret:
   `npx convex env set --prod POLAR_WEBHOOK_SECRET <secret>`
5. **Sync the product catalog** (required): the product was created before
   the webhook existed, so its `product.created` event never arrived —
   without this step a paying supporter resolves to the FREE plan
   (getCurrentSubscription can't join the subscription to a product):
   `npx convex run billing:syncProducts --prod`

## 3. Test the loop end to end (sandbox)

1. `npx convex deploy -y` (already done if you followed the release
   ordering).
2. On the live site: Library → ⋯ → Account & storage → **Become a
   supporter** → pay with a test card.
3. Verify the dialog flips to plan **Supporter** (webhook round-trip).
4. **Manage subscription** → cancel → verify the plan drops back to Free at
   period end (or immediately revoke in the Polar dashboard) and that every
   existing book still reads/syncs/exports.

## 4. Turn on quota enforcement

Only after billing works (otherwise free users hit the limit with no
upgrade path — existing data is safe either way):

```sh
npx convex env set --prod QUOTA_ENFORCED 1
# optional overrides (MB):
npx convex env set --prod FREE_QUOTA_MB 250
npx convex env set --prod SUPPORTER_QUOTA_MB 10240
```

Frontends deployed before this feature will get "Please reload Librium to
finish this import." on their next import (the legacy unverified attach
path refuses while enforcement is on) — push the new frontend before or
with the flip.

Deploy ordering for the release itself is the reverse: `npx convex deploy`
BEFORE (or immediately with) the main push — the new frontend calls
`books.finalizeUpload`, which the old backend doesn't have, so a frontend
that goes live first fails every import until the Convex deploy lands.

## 5. Go production

Repeat 1–2 with a real org at https://polar.sh (`POLAR_SERVER production`),
against the production Convex deployment. Polar reviews new orgs before
first payout; their onboarding covers identity/payout details.

## Notes

- Income: Polar is merchant of record — no sales-tax registrations for
  you; payouts are ordinary personal income for your own tax return.
- `web/src/routes/privacy.tsx` lists `hello@librium.dev` as the
  deletion-request contact — make sure that address (or a replacement)
  actually receives mail.
- Kill switch: unsetting `QUOTA_ENFORCED` returns to unlimited uploads;
  unsetting `POLAR_ORGANIZATION_TOKEN` hides all billing UI. Both are safe
  at any time; neither touches data.
