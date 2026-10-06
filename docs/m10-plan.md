# M10 plan: hardening (proposed, not approved)

Proposed in owner Step 87. **Not approved yet; no M10 work started.** Acceptance criteria stay
in `milestones.md` (M10): a written review in **`docs/hardening-report.md`** with every issue
fixed or consciously deferred, and a suspended shop returns 404 / unsuspending restores it,
both logged (tests). One branch per checkpoint, merged through PRs after every check passes;
three review stops; gate → tag `m10-done`.

**Native build: one, optional, in CP5** — only for the Expo SDK 57 patch releases of
2026-10-07 (decision #80: expo 57.0.27, expo-notifications, expo-updates, expo-router and four
more), with a version bump to 0.3.1; you choose EAS or local, or to skip it until M11's
production build. Everything else needs none: Sentry's native module is already in build 0.3.0
(#70) and M10 turns it on from JavaScript (an EAS Update). If Sentry's native side misbehaves,
it stays off and I tell you (your #70 rule).

**Scope today (for sizing):** 74 API routes, 15 web pages, 40 app screens, 8 GitHub Actions
workflows, 79 decisions.

---

## The report: `docs/hardening-report.md`

Started in CP1 and filled in by every checkpoint. One row per finding:

| ID | Area | Finding | Severity (high / medium / low) | Status | Evidence |
|---|---|---|---|---|---|

Status is **fixed** (PR and test named), **deferred** (why, and to which milestone or V2), or
**accepted** (why it's fine as it is). Nothing is left open at the gate. The report also lists
what was checked and found fine, so the review can be repeated.

---

## CP1 · Security review (report only, then fixes)

1. **Every endpoint, automatically.** A test walks `apps/web/app/api/**/route.ts` and fails
   unless each handler is one of: seller session (`requireSeller` / `requireUser`), order token,
   Bearer cron/ops secret, the same-origin buyer check, or on a short reviewed public list
   (health, public shop reads, auth). A new route without a guard then fails CI for good.
2. **Authorization layer:** every repository query is scoped (`shop_id`, owner, token); an
   "another seller's id" test exists for every by-id route (fill any gaps).
3. **Auth:** Better Auth settings (session length, cookie flags, origin checks, the allowed
   route list), sign-up / sign-in / reset / change-password / deletion flows, user enumeration
   (same answers), timing, lockout and every rate limit (a table of limits in the report).
4. **Input and output:** strict zod on every write (already tested for whitelists), size limits
   (bodies, photos, text), what each public endpoint returns (no buyer phone or email leaks on
   public pages), safe redirects.
5. **Web headers:** none are set today (`next.config.ts`). Add a Content-Security-Policy,
   `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`
   / `X-Frame-Options`, `Permissions-Policy`, with Playwright checks that pages still work.
6. **Secrets:** a scan of the whole git history for keys/tokens (pattern scan, no new tool
   download), env var inventory (where each lives: Vercel, GitHub, EAS; who reads it), logs and
   error messages never carry secrets (#45), cron/ops secrets constant-time and 404.
7. **Storage:** public vs private stores, key prefixes, presign limits (type, size, 10 min), no
   listing from the browser, the purge's scope (#76).
8. **Dependency audit:** `pnpm audit --prod` (a small network query to npm's audit service,
   **asks you first**); upgrade or document every high/critical finding.
9. **Database:** Neon roles (the app's role can't drop tables or read other databases), SSL,
   backups encrypted, migrations expand-only.

Fixes for high/medium findings in the same checkpoint (PRs), low ones fixed or deferred with
a reason.

## CP2 · Suspend / unsuspend and the admin clean-up (decision #72 d, f)

- `shop-suspend.yml` (manual: shop link name, `suspend` or `unsuspend`, reason) →
  `POST /api/ops/shops/suspension` (Bearer `OPS_SECRET`, constant-time, 404 otherwise) → sets
  or clears `shops.suspended_at` and writes an `ops_events` row (`shop_suspended` /
  `shop_unsuspended`, actor = the GitHub user, a snapshot). Suspended = public pages and new
  orders 404 (already enforced), the seller app shows "Your shop is suspended, email support"
  instead of failing quietly, and the purge leaves suspended shops alone unless deleted.
  Never touches Demo Duka by mistake (refused unless named exactly).
- Remove the unused admin code: `requireAdmin`, `adminRepo`, the `admin@example.test` seed,
  reads of `profiles.is_admin`. The **column stays** (expand → contract: dropping it is a later
  migration once no deployed code reads it, M11).
- Tests: suspend → shop/product/checkout 404 + audit row; unsuspend restores; wrong/missing
  secret 404; unknown slug; twice is harmless (the milestone's acceptance).
- → 🛑 **Review stop A** (phone + web: the security fixes you can see, e.g. headers don't break
  anything; suspend your test shop from Actions → it 404s → unsuspend → it's back).

## CP3 · States, accessibility, performance

- **States:** a checklist of all 40 app screens and 15 web pages × loading / empty / error /
  offline (app) / not found; every gap fixed. Written into the report.
- **Accessibility:** an automated contrast test over the design-token colour pairs actually
  used (AA: 4.5:1 text, 3:1 large/icons); 44 dp tap targets; labels on every input and icon
  button (lint rule + review); web: Playwright + axe-style checks without a new download if
  possible (otherwise asks first); app: a **TalkBack pass on the Redmi by you** with a short
  script.
- **Performance:**
  web: bundle sizes from `next build`, the checkout page's zod bundle (#61 carry-over), images,
  PageSpeed Insights on staging (≥ 85 mobile, as in M4);
  database: `EXPLAIN` of the hot queries (orders and reviews paging vs their indexes, insights,
  customers) on a large generated dataset locally, with indexes added expand-only if needed;
  `orders.idempotency_key` unique across shops vs per-shop lookups (decide: keep, or a
  per-shop unique index);
  app: list rendering, image sizes (review photos single 1280 px size: keep or add a thumbnail),
  cold start.

## CP4 · Sentry, push receipts, backups

- **Sentry, web:** `@sentry/nextjs` (**a new dependency, asks you with its size first**),
  server + browser, `beforeSend` scrubbing every secret and personal field from #45 (passwords,
  codes, tokens, cookies, emails, phones, M-Pesa codes), with tests that a captured error
  carries none of them. Source maps uploaded from the Vercel build with an auth token.
- **Sentry, app:** `Sentry.init` in JavaScript with `EXPO_PUBLIC_SENTRY_DSN` (the DSN is a
  public client key, set in the EAS `preview` environment), the same scrubbing, release = the
  EAS Update group so errors point at the right code. Source maps for EAS Updates uploaded by
  a GitHub Actions step (sentry-cli runs there, never on the laptop; `allowBuilds` stays off
  locally). No config plugin, so no native build.
- A test error from each (web and phone) shows up in Sentry with readable stack traces and no
  personal data.
- **Expo push receipts:** the hourly job also checks push receipts and removes tokens Expo
  reports as dead (carried from M6).
- **Backup check:** `backup-restore-check.yml` (manual + weekly): downloads the newest
  encrypted staging backup, restores it into a throwaway Postgres in GitHub Actions, and checks
  counts and the latest migration. No credentials on the laptop.

## CP5 · App UI tests, eas-cli, Expo SDK patches

- **Automated UI tests** for the app's key screens (sign-in, onboarding steps, order detail
  actions, settings forms, share/help) with `jest-expo` + React Native Testing Library:
  render, states, buttons and labels, without a phone. **A new dev dependency (~30–40 MB
  download), asks you first.** End-to-end device tests (Maestro) are bigger (a CLI + Java,
  hundreds of MB) and stay out unless you want them.
- **eas-cli** 24.8 → 24.11 on the laptop (a global npm upgrade, ~30 MB, **asks first**), and
  `cli.version` in `eas.json` raised to match.
- **Expo SDK 57 patches** (decision #80): `expo install` the seven patch versions (a few MB,
  **asks first**), bump the app to 0.3.1, `check-native-runtime.mjs --write`, and a native
  build **only with your go-ahead** (EAS or local). Then EAS Updates target 0.3.1. Or skip
  until M11's production build (your call, question 6).
- → 🛑 **Review stop B** (phone: the states you can trigger, TalkBack script, Sentry test events
  visible in the dashboard, a forced app error reported, push receipts in the job summary,
  the restore check's summary).

## CP6 · Full end-to-end regression on staging (Redmi)

- One written script (`docs/regression-script.md`) covering every flow from M2 to M8, numbered,
  with expected results: sign-up → onboarding → products → share → buyer browse / cart /
  checkout (pay now and pay on delivery) → pay page → every seller order action (incl.
  payment not found, cancel, refund) → delivered → review + reply + report → insights /
  customers → settings (details, password, profile + link change, payments, pause, feedback)
  → help / rate → suspend / unsuspend → delete (app and web) → backdate + purge (dry run, real)
  → digest; offline checks along the way; Demo Duka reseeded first.
- I run every automated part first (`check:all`, Playwright against staging where safe, the
  jobs' dry runs) and fix what breaks; you run the phone script in sittings.
- → 🛑 **Review stop C** (the regression results), then the **gate** → `m10-done`.

---

## Schema changes
- None required. Possibly: an index from the CP3 query review (expand-only), and `ops_events`
  actions `shop_suspended` / `shop_unsuspended` (code only, no migration). Dropping
  `profiles.is_admin` waits for a later contract migration (M11).

## What I need from you
1. **Approval** of this plan, and answers to the questions below.
2. **Sentry** (CP4), step by step when we get there, never pasting anything secret in the chat:
   create a free Sentry account/organisation; two projects (Next.js → `oda-web`, React Native →
   `oda-seller`); put each DSN where I name it (Vercel env for the web, the EAS `preview`
   environment for the app); create an auth token for source maps and add it to Vercel and
   GitHub Actions secrets by name. I verify by name only.
3. **TalkBack pass** on the Redmi (CP3, ~15 minutes with my script).
4. **The regression** (CP6): about an hour on the phone, in two or three sittings.
5. Download approvals as they come up (each with its size): `pnpm audit` query (tiny),
   `@sentry/nextjs`, `jest-expo` + React Native Testing Library, eas-cli upgrade.

## Questions for you
1. **App UI tests:** `jest-expo` + React Native Testing Library only (my suggestion), or also
   Maestro device flows (large download, an emulator or the Redmi over adb)?
2. **Sentry plan:** the free Developer plan (one user, 5k errors a month) is enough for staging
   and launch. OK?
3. **Security headers:** a strict Content-Security-Policy may need small changes to how pages
   load fonts and images. OK to tighten in CP1, with Playwright checks and a staging test?
4. **Suspended sellers:** the app shows "Your shop is suspended. Email support@mugu-labs.com"
   and keeps the seller signed in (read-only). OK, or sign them out?
5. **`orders.idempotency_key`:** if the CP3 review confirms it, switch to a per-shop unique
   index (expand: add the new index; contract: drop the old one in M11). OK?
6. **Expo SDK patches** (#80): upgrade in M10 CP5 with a 0.3.1 native build, or wait for M11's
   production build?
