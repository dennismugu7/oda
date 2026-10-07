# M10 hardening report

The written review that M10's acceptance asks for (`milestones.md` → M10, plan
`docs/m10-plan.md`, decision #81). Every finding is **fixed** (with the test that proves it),
**deferred** (why, and to when) or **accepted** (why it's fine). Nothing is left open at the
gate. Each section also lists what was checked and found fine, so the review can be repeated.

Status on 2026-10-07: **CP1 (security), CP2 (suspend / unsuspend) and CP3 (states, accessibility, performance) done.** CP4–CP6 add their sections.

## Findings

| ID | Area | Finding | Severity | Status | Evidence |
|---|---|---|---|---|---|
| S1 | Input | The buyer name went through `stripLinks` before its 60-character check. The link pattern is quadratic on input like `a.a.a.…` (measured: 16,000 chars 0.8 s, 64,000 chars 9 s), and checkout parses the body before any limit, so one anonymous order request could tie up a server function. | medium | **fixed** (CP1) | `buyerName` is capped at 240 chars before cleaning (`packages/shared/src/checkout.ts`); test `checkout.test.ts` "refuses a very long name quickly" (200,000 chars in under 200 ms). Review text was already capped at 1,000 before cleaning. |
| S2 | Logs | Unexpected errors were logged as whole objects. A Drizzle query error's message carries the query **parameters** (buyer phones, emails, token hashes) and a Postgres error's `detail` repeats row values. That breaks decision #45. | medium | **fixed** (CP1) | `server/safeLog.ts` `describeError()`: name, Postgres code/table/column/constraint, the SQL text without parameters, a scrubbed message, stack frames. Used by `toResponse`, `/api/health` and the demo seed. Test `safeLog.test.ts` runs a real failing query with an email, phone and token as parameters and checks none reach the log line. |
| S3 | Web headers | No security headers were set: no CSP, no HSTS, no framing protection. | medium | **fixed** (CP1) | `proxy.ts` + `server/securityHeaders.ts`: per-request nonce CSP (`script-src 'self' 'nonce-…' 'strict-dynamic'`, `style-src` with the nonce, `object-src`/`frame-src`/`media-src 'none'`, `frame-ancestors 'none'`, `form-action`/`base-uri 'self'`, images and uploads only to the configured storage origins). `next.config.ts` adds HSTS (2 years), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, COOP; API answers get `default-src 'none'`. Tests: `securityHeaders.test.ts` (8), Playwright `security-headers.spec.ts`, and **every Playwright test now fails on a CSP violation** (`e2e/test.ts`). |
| S4 | Web headers | The strict CSP blocked the Google Fonts stylesheet inside the local email outbox's email previews. | low | **fixed** (CP1) | Only `/dev/outbox` (local only, 404 on Vercel) may load `fonts.googleapis.com` / `fonts.gstatic.com`; nothing else was loosened (decision #81 c). Test in `securityHeaders.test.ts`. |
| S5 | Endpoints | Five catalogue handlers (create product, photo list, create category, reorder categories, category products) read and validated the body before checking the session: a signed-out caller got 422 instead of 401. Nothing was written. | low | **fixed** (CP1) | `server/catalogueRoutes.ts` checks the seller first; `routeGuards.test.ts`. |
| S6 | Settings | Removing a payment account checked "not active" and deleted in two statements; an account made active at the same moment could be deleted. Same shop only. | low | **fixed** (CP1) | `deleteInactivePaymentAccount` deletes only `is_active = false` rows in one statement; `settings.test.ts`, `authz.test.ts`. |
| S7 | Input | A few strings had no maximum length before a regex or transform (any phone field, the payment account number, the web deletion email). Linear today; defence in depth. | low | **fixed** (CP1) | `kePhone` ≤ 32, account number ≤ 32, deletion email ≤ 254. |
| S8 | Tests | Pre-existing flaky Playwright tests: `lastEmailTo` returned the newest email to an address straight away, which could still be the sign-up code rather than the deletion or reset link sent after the response (failed once on `main` during this review). | low | **fixed** (CP1) | `e2e/outbox.ts` `lastEmailTo(to, match)`; delete-account and reset-password specs wait for the right email. |
| S9 | Tests | Cross-shop route tests were missing for: manual-order quote with another shop's product, product create/update with another shop's category (and the list filter), the buyer quote with another shop's product. The code was already scoped. | low | **fixed** (CP1) | New tests in `sellerHome.test.ts`, `catalogue.test.ts`, `checkout.test.ts`. |
| S10 | Dependencies | `pnpm audit --prod`: 3 high (node-forge, braces, source-map-js), 3 moderate (esbuild, uuid, decode-uri-component). All are in the seller app's **build and dev tooling** (Expo CLI code signing, Metro, Expo's PostCSS, drizzle-kit's loader, the iOS `xcode` package): none runs in the web server, and none handles untrusted input in the app at runtime. node-forge and braces have no patched version yet. | high (tooling only) | **deferred** to CP5 | Re-run `pnpm audit --prod` after the Expo SDK 57 patch upgrade (CP5); upgrade or add overrides for anything with a patched version then. |
| S11 | Database | The staging app very likely connects with Neon's owner role, which can drop tables. A least-privilege app role (DML only) with migrations run by the owner role is the safer setup. | medium | **deferred** to M11 | Production Neon is set up in M11: an `oda_app` role with `SELECT/INSERT/UPDATE/DELETE` only for the app, the owner role only in the `migrate` workflow. Owner steps written then. Staging stays as is (test data only). |
| S12 | Database | `orders.idempotency_key` is unique across all shops while lookups are per shop: a key reused in another shop would answer 500 (and tell the caller the key exists). Keys are random client UUIDs. | low | **fixed** (CP3), contract in M11 | Per-shop unique in migration 0007; a clash is 409 (`orders.test.ts`); the global constraint is dropped in M11 (decision #84 a). |
| P1 | Performance | The Orders tab and seller reviews sorted every row of the shop on each page (truncated time, no index): ~115 ms per page at 100,000 orders, ~240 ms deep. | medium | **fixed** (CP3) | Expression indexes + row-comparison cursor (migration 0007, #84 b): 8–13 ms per call. `server/perf/run.ts`. |
| P2 | Performance | The buyer pages shipped zod and every schema to the browser (#61): 247 KB of gzipped JavaScript on first load. | medium | **fixed** (CP3) | `@oda/shared` `sideEffects: false`: 152 KB (#84 d). |
| A1 | Accessibility | `textMuted` (placeholders, "Optional") 3.39:1 and `warningText` 4.21:1: below AA. | medium | **fixed** (CP3) | Darker tokens (#84 c); `contrast.test.ts`. |
| A2 | Accessibility | Brand orange: white on primary and primary text 4.23:1, primary on its tint 3.80:1; star yellow 2.19:1 as a graphic. | medium | **owner decision** (review stop B) | Listed in `contrast.test.ts` as pending; options in the stop B message. |
| A3 | States / a11y | Screen-by-screen audit: web 13 state gaps (incl. a checkout bug: with no pickup, "Place order" did nothing until a delivery area was chosen; a silent failure on the delete confirm) and ~25 a11y issues; app 14 state gaps (endless spinners, wrong offline wording, 404s with a useless retry) and ~15 a11y issues (nested buttons, small targets, iOS-only hiding). | medium | **fixed** (CP3) | #84 e; Playwright `a11y.spec.ts`; TalkBack pass on the Redmi at review stop B. |
| S13 | Push | Any signed-in user who knows another phone's Expo push token can register it to their own account (the token moves). Tokens are not exposed anywhere. | low | **accepted** | Moving a token on sign-in is how a phone switches accounts (M6). Revisit if tokens ever become visible. |
| S14 | Catalogue | When a photo is removed from a product, its file is deleted even if the same shop's other product uses the same key (only possible with a hand-crafted request by that seller). | low | **accepted** | Keys are chosen by the server per upload; the app never reuses one. A seller can only affect their own shop. |
| S15 | Input | No cap on JSON body size before parsing (Vercel's platform limit is 4.5 MB). | low | **accepted** | With S1 fixed, every schema bounds its strings and arrays before any slow work; parsing 4.5 MB of JSON takes milliseconds. |
| S16 | Output | Public review photo URLs contain the order's internal id (`reviews/<order uuid>/…`). | low | **accepted** | A random UUID: not enumerable, and order access needs the separate `public_token`. |
| S17 | Admin | `requireAdmin`, `adminRepo`, `profiles.is_admin` reads and the `admin@example.test` seed are dead code since #72. | low | **fixed** (CP2) | Removed (decision #82 f); `is_admin` stays unwritable (`authz.test.ts`) until the M11 contract migration. |

## CP1 · Security review: checked and fine

**Endpoints (74 route files).** `server/routeGuards.test.ts` lists every `app/api/**/route.ts`
with its guard and calls every exported handler with no session, no secret and a cross-site
`Origin`. A route that isn't listed, or that doesn't refuse, fails CI.
- Seller session (`requireSeller` / `requireUser`, 401): 49 route files.
- Order token (`requireOrderToken`, 404 for an unknown token, 403 cross-site): `o/[token]/*` (6).
- Bearer secret (constant-time compare of SHA-256 digests, 404 otherwise): `cron/*` (3), `ops/reviews/remove`.
- Same-origin buyer writes (`assertSameOrigin`, 403 cross-site; requests without `Origin` or
  `Sec-Fetch-Site` pass, since only browsers can be forged into cross-site posts):
  `shops/[slug]/orders`, `shops/[slug]/visit`, `delete-account/*` (3).
- Public by design (10): `auth/[...all]` (Better Auth, 6 endpoints allowed, the rest 404),
  `health` (ok/db/commit only), `signup/*` (from the app; per-IP, per-email and per-attempt
  limits), `reset-password/check`, `shops/[slug]/cart|quote|products/[id]/reviews` (a public
  shop's data; unknown shop 404), `dev-uploads` (local driver only, signed PUT; 404 on Vercel).

**Authorization layer.** Every repository read and write on shop data is scoped by the
context's `shopId` / `userId` or the order token (review of all 14 repositories and the direct
queries in `orders.ts`, `reviews.ts`, `checkout.ts`, settings, purge, digest). By-id lookups
use `id AND shop_id`; reorder lists must be exactly the shop's own set; photo, logo and
screenshot keys must sit under `{prefix}/{shopId}/` (no `..`); review photos under
`reviews/{orderId}/`; checkout and manual orders resolve products and delivery areas inside
the shop and price them from the database. Order status changes only in `transitionOrder()`
(seller scope `id + shopId`, buyer scope `id + publicToken`). Cross-shop jobs (cron, purge,
digest, ops) sit behind Bearer secrets. Every write schema is `strictObject` (no request body
is spread into a write).

**Auth (Better Auth 1.7.6).** Only 6 endpoints are served (`get-session`, `sign-in/email`,
`sign-out`, `request-password-reset`, `reset-password`, `change-password`). Origin checks on
(`trustedOrigins: oda://`; the app's `expo-origin` header). Sessions 60 days, renewed daily;
password 8–128 characters with a strength check; email verified before the account exists
(oda's own sign-up, #43); reset links 1 hour, single use, in the URL fragment (#45), all
sessions revoked on reset; a deleted account can't sign in (403 only after the right password).
Cookies: Better Auth's defaults (HttpOnly, SameSite=Lax, Secure on https). The `bearer` plugin
stays (server tests; same secret as the cookie). User enumeration: reset and web deletion
answer the same for any email, with the lookup after the response; sign-up tells the email
already has a shop on purpose (#43) behind per-IP limits.

**Rate limits** (Postgres-backed, shared by every Vercel instance; client IP only from
`x-vercel-forwarded-for` / `x-real-ip`, which Vercel sets):

| Action | Limit |
|---|---|
| Sign-in | 5 wrong passwords per email / 15 min (lock; reset clears it), 100 per IP / 15 min |
| Sign-up | 30 per IP / h; codes: 5 sends per email, 30 per IP, 10 checks per email, 60 per IP per hour |
| Password reset | 30 requests per IP / h, 5 emails per address / h (silent), 30 resets per IP / h, link check 60 per IP / h |
| Change password | 10 per account / h (wrong ones count), 30 per IP / h |
| Web account deletion | 10 requests per IP / h, 3 emails per address / h (silent), 60 checks/confirms per IP / h |
| Checkout | 30 orders per IP per shop / h, 5 per phone per shop / h, quotes 120 per IP / min |
| Order page | lookups 60 per IP / min, M-Pesa messages 10 per order / h, reports 3 per order and 10 per IP / day, buyer emails 5 per address / day |
| Reviews | 10 writes per order / day, 20 photo uploads per order / h, seller reports 10 per shop / day |
| Storefront | visits, cart checks, reviews pages: 120 per IP / min each |
| Seller | uploads 120 / h, link-name checks 60 / min, link changes 5 / day, feedback 5 / day |

**Input and output.** Errors answer only a code, a message and field messages (unknown errors
a plain 500). Public shop data has no owner email, recovery phone, payment numbers or tokens;
reviews show "First L." built on the server, text without links or phone numbers. Buyer
details, M-Pesa codes and the payment snapshot are only on the order's token page (noindex,
no referrer). No `dangerouslySetInnerHTML`; every user value in email HTML is escaped; WhatsApp
links use digits only plus `encodeURIComponent`. The only redirect (old shop links) is built
from the database slug and a same-site path, so it can't send anyone off-site. Uploads: JPEG,
PNG or WebP only, at most 5 MB, presigned for 10 minutes for one server-chosen key, then
re-checked on the server (size, magic bytes, no location data) before any row points at them.

**Secrets.** A pattern scan of all 197 commits (every branch) for Vercel Blob, Resend, Neon,
GitHub, AWS, Expo, Sentry, Slack and Google keys, private keys and database URLs with
passwords found nothing; the only committed env files are the three `.env.example` files
(local placeholders). Inventory (names only):
- Vercel (web, server-only): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  `CRON_SECRET`, `OPS_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `EXPO_ACCESS_TOKEN`,
  `PUBLIC_SHOP_BASE_URL`, `STORAGE_*`, the connected Blob stores (`BLOB_*`,
  `FEEDBACK_BLOB_READ_WRITE_TOKEN`), `DEMO_SHOP_SLUGS`, `ODA_SUPPORT_EMAIL`,
  `ODA_SUPPORT_WHATSAPP`, `APP_DOWNLOAD_URL`.
- GitHub Actions: `NEON_STAGING_DATABASE_URL_UNPOOLED`, `CRON_SECRET`, `OPS_SECRET`,
  `BACKUP_BLOB_READ_WRITE_TOKEN`, `BACKUP_PASSPHRASE`, `STAGING_IMAGES_BLOB_READ_WRITE_TOKEN`,
  `VERCEL_DEPLOY_HOOK_STAGING`.
- App bundle (public by nature): `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SHOP_BASE_URL`.
- No Neon credentials on the laptop (migrations only through `migrate-staging`).

Logs: emails by kind and recipient domain only; push and email failures by error name; jobs by
counts; unexpected errors through `describeError` (S2).

**Storage.** Public photo store (`products/`, `logos/`, `reviews/`); private feedback store
(presigned GETs for 7 days in the digest only); backups store reachable only from GitHub
Actions. Listing needs a token the browser never has. The purge's scope is unchanged (#76).

**Database.** Neon only accepts TLS connections; backups are
`pg_dump` encrypted with gpg AES-256 (decrypted and compared before upload) in a separate
store; migrations are expand-only (CLAUDE.md). Role separation: S11.

## CP2 · Suspend / unsuspend (milestone acceptance)

`server/suspension.test.ts` (decisions #81 d, #82):
- The endpoint needs `OPS_SECRET` (404 without or with a wrong one) and valid input (422);
  unknown, partial and old link names and deleted shops are 404 and change nothing.
- **Suspend → the shop is 404** (shop page lookup) and takes no orders (the order insert both
  checkout and manual orders use refuses it); another shop is untouched; **an `ops_events`
  row** with the actor, reason and snapshot. Twice: no change, no second row.
- **Unsuspend restores it** (the shop page is back, edits work again) with its own audit row.
- A suspended seller stays signed in, sees `suspended` in `/api/me`, reads orders and products
  and takes an order from accepted to delivered; changes their own details and sends feedback
  (screenshot upload allowed). Product create / edit, shop profile, pause, manual orders and
  product photo uploads answer 403 `shop_suspended` with the support email, and nothing changes.
- The purge leaves a suspended (not deleted) shop alone, even 90 days on.
- `routeGuards.test.ts` lists the new route (`secret`).

## CP3 · States, accessibility, performance

**States audit** (code review of every screen; app screens share `SettingsLayout`, `useLoaded`,
`OfflineBar`; web pages the root `error.tsx` / `not-found.tsx`):
- **App (40 screens):** after the fixes every screen has a first-load indicator, an empty state
  where a list can be empty, an error with "Try again" (or "Back" where retrying can't help);
  offline it shows the saved copy with "You're offline · showing saved data", or "You're
  offline. Connect to load this." when nothing is saved, with edits disabled; detail screens
  answer a deleted order / product / review with a clear "no longer exists". Paged lists show a
  retry footer when the next page fails.
- **Web (16 pages):** skeleton `loading.tsx` for shop, product and order pages; `global-error`;
  the cart waits for the saved cart before rendering (no false "empty"); every client request
  (cart check, quote, order, review photo, delete confirm, reset check) shows progress, has a
  timeout and a "Try again", and never double-submits.

**Accessibility:** automated contrast test (21 text pairs at 4.5:1 or more, 3 graphic pairs at
3:1 or more, brand pairs pending: A2); Playwright `a11y.spec.ts` (names, labels, alt text, 44 px
buttons, `h1`, `lang` on 11 pages); a global `:focus-visible` outline; app labels checked screen
by screen (every TextInput, icon button and Switch labelled), 44 dp targets, nested buttons
separated or given TalkBack actions, decorations hidden on Android. **TalkBack pass on the
Redmi: owner, review stop B.**

**Performance** (local Docker Postgres 18, the seed shop grown to 99,542 orders / 121,974 items;
`server/perf/run.ts`, local databases only; median of 5 runs):

| Call | ms |
|---|---|
| Orders: all page 1 / page 2 / done / to do | 9.0 / 7.7 / 8.1 / 12.1 |
| Orders: search name / phone | 8.5 / 13.4 |
| Insights: today / week / month | 59 / 41 / 91 |
| Customers: all / repeat / search | 161 / 165 / 293 (accepted, #84 g) |
| More / Home / Reviews | 25 / 11 / 5 |

Web, production build, cold first load at 390 × 844 (gzipped JavaScript): landing 149 KB, shop /
product / search / cart / checkout 152–155 KB (was 247–250 KB), legal and account pages
149–151 KB.
