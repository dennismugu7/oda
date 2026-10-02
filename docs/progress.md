# Progress log

Newest entries at the top.

## 2026-10-02 · M1 checkpoints 4–5, at review stop B (branch `m1-database-security`, draft PR #4)

**Done**
- Laptop now 32 GB: `~/.gradle/gradle.properties` → `-Xmx6g`, `workers.max=6`, `parallel=true` (owner's correction), other keys kept; decision #35 (amends #29/#30). Low-memory stop stays on. Health check after the restart: Docker + `oda-postgres` up, branch clean, the four checks green.
- CP4 authorization layer: write whitelists (`packages/shared/src/schemas`), `errors.ts`, `authz.ts` (branded contexts, missing-profile repair), `uploads.ts`, repositories (user, seller, public, order-token, admin), ESLint guard on `@oda/db`/`drizzle-orm`/`pg` outside `apps/web/server/**` (also the seller app, shared, ui-tokens). 24 authorization tests.
- CP5 `apps/web/server/orders.ts`: `nextOrderNumber()`, `insertOrder()` (prices, fees, payment-account snapshot and cover from the DB; idempotency key; shop rules), `transitionOrder()` (scoped load, machine, optimistic update → 409, events, payment claims, duplicate-code flag). 23 tests incl. the confirm/confirm and cancel/confirm races and concurrent numbering.
- Both suites were mutation-checked: removing the shop filter or the status condition makes them fail.

**Deviations**
- Paused shops stay browsable (`isPaused`, spec §6); only suspended/deleted shops are not found.
- Order `status` is server-owned on every schema except products (their own `status`).
- Validation limits chosen (to confirm): Till/Paybill 5–7 digits, Pochi stored in E.164, price ≥ KSh 1, shop name 2–40 chars; channel values open until M2.
- Lines for products with sizes/colours must name one; manual orders may use sold-out products and pickup even when pickup is off.

**Review stop B: approved** with changes (decision #36): pay on delivery on; 13 products (earrings in a visible Accessories, new Leather tote); history on soft-deleted older stock; order numbers follow the 126 deliveries.

**CP6 seed** (`apps/web/server/seed/`, through Better Auth, the repositories, `insertOrder()` and `transitionOrder()`): `pnpm db:reset` builds 13 products, 142 orders, 126 delivered, 38 reviews (33/3/1/1 → 4.76, shown 4.8, 2 need a reply), 42 customers; to-do 2 to confirm / 4 to send / 3 new; this week KSh 18,250 from 6 sales, 12 orders of which 8 TikTok; sold counts 5/3/2/4; a duplicate M-Pesa code, refund_due, refunded, expired, buyer- and seller-cancelled and an unresolved claim. Fixed on the way: the shop checklist update failed when nothing was unticked (new test).

**CP7 (code ready, waiting for the secret):** `apps/web/vercel.json` stops automatic `main` deployments; `migrate-staging` runs after green CI on `main`: migrate → Deploy Hook → wait for `/api/health` to show the commit (decision #37); CLAUDE.md migration rule (backward compatible, expand → deploy → contract).

**Needs from the owner:** Vercel Deploy Hook for `main` saved as repository secret `VERCEL_DEPLOY_HOOK_STAGING`. Proven by the M1 merge itself.

**Next:** CP8 `setup-android-windows.ps1` (32 GB or more → `-Xmx6g`, 6 workers, parallel; decision #35).

## 2026-10-01 · M1 Database & security: checkpoints 1–3, at review stop A (branch `m1-database-security`, draft PR #4)

**Done**
- CP1 `packages/shared`: order state machine (every transition in order-lifecycle.md, exhaustive sweep of 3,640 combinations), pricing, Kenyan phones, M-Pesa code extraction (all-letters codes accepted), slugs. Decision #33.
- CP2 schema `0001`: all 20 data-model tables + Better Auth's 4 (`auth_*`, uuid), enums, constraints, indexes. Better Auth 1.7.6 server core in apps/web (email + password, bearer sessions, profile hook). Tests run on throwaway databases created and migrated automatically (also in CI): `oda_test` for apps/web, `oda_db_test` for packages/db. They are separate because Turbo runs both suites in parallel; sharing one caused migration races.
- CP3 `0002`: updated_at, status guard, sale aggregates, ratings, payment-verification reset, slug history/guards, same-shop composite foreign keys, `rate_limit_hit()`. Decision #34; data-model.md aligned.

**Deviations**
- `better-auth` 1.7.6, not 1.7.7 (pnpm's release-age guard; 1.7.7 is under a day old).
- Auth schema verified by a test against Better Auth's `getSchema()` instead of the CLI (the CLI can't load a config that imports `server-only`).
- Added beyond the plan: same-shop composite foreign keys (decision #34 f).

**Review stop A: approved** by the owner, including decision #34 (c)–(j), the Better Auth 1.7.6 pin and `unverified` as the default payment-account status.

**Next:** CP4 authorization layer (after the owner's go-ahead; the laptop is getting a RAM upgrade, 16 → 32 GB).

**Change to CP8:** `scripts/setup-android-windows.ps1` sizes the Gradle limits from the detected RAM instead of hardcoding them: at 16 GB today's values (`-Xmx2560m`, `workers.max=1`); at 32 GB e.g. `-Xmx4g`, `workers.max=3`. It prints the chosen tier, and decisions #23/#29/#30 get updated with the RAM-based rule.

## 2026-10-01 · Approved welcome animation added for M2 (branch `design/welcome-animation`)

- Owner-approved assets added (owner's request; `design/` is otherwise read-only): `design/app/welcome-animation/01-welcome-animation-preview.html` (exact reference for timing, feel and card content) and three transparent PNGs (fashion 360×290, food 360×304, accessories 360×214), also copied to `apps/seller/assets/welcome/` for the app. Checked before copying: the preview contains "Nairobi · Kilimani" and no "M-Pesa till checked"; the PNGs are RGBA with transparent corners at the expected sizes; the preview embeds the same three images (scaled to 240 px wide).
- `design-changes.md`: 01-welcome section replaced by the approved spec (card content, 5-step choreography ~2.85 s, reduce-motion = final state, smooth on the Redmi 15c). `milestones.md` M2 acceptance: side-by-side check against the preview on the Redmi 15c.
- Not built yet (M2). One implementation note added to keep it smooth: the tile's glow is an opacity/scale-animated layer, not an animated shadow.

## 2026-10-01 · M0 closed

- PR #1 merged into `main` as `e24fd42` (merge commit); annotated tag **`m0-done`**. CI green on `main`.
- `migrate-staging`, first run on `e24fd42`: success, "migrations applied". Neon staging now holds the M0 baseline only (`drizzle.__drizzle_migrations`, 1 row; the baseline is `SELECT 1`, tables arrive in M1). Owner can confirm in the Neon console.
- **Production (staging) web: https://oda-eta.vercel.app**, public. `/api/health` → `{"ok":true,"db":"up","commit":"e24fd42"}` (owner + curl), home page 200. Region confirmed: `X-Vercel-Id: cpt1::fra1::…` (edge Cape Town, function Frankfurt next to Neon). Recorded in CLAUDE.md → Commands.
- Gate outcomes (decision #31) and the answers to the 18 open doc questions (decision #32) recorded; spec.md, design-changes.md, order-lifecycle.md, milestones.md (M0 status closed; Firebase in M6) and CLAUDE.md (pricing path, env names, source-of-truth rule) updated.
- **Next:** M1 (Database & security), not started; it begins with a short plan for approval.

## 2026-10-01 · M0 Foundations: complete, ready for the gate review (branch `m0-foundations`, PR #1)

**Acceptance (milestones.md M0)**
- `pnpm dev` runs web + app locally: **pass**. Web 200, `/api/health` `db: up`, Metro running and serving the Android bundle (6.4 MB). Not yet exercised: a dev-client build on the phone loading from Metro (the device check used release APKs).
- Web staging URL shows the placeholder in Poppins and brand colours: **pass** on the Preview deployment https://oda-git-m0-foundations-dennismugu7-6048s-projects.vercel.app (owner's check: Poppins, brand orange, peach card, both buttons; `/api/health` `db: up` against Neon). The public Production deployment only exists after the merge.
- App opens on Android showing the welcome screen (static): **pass**. Pre-release `m0-preview-2` on the Redmi 15c (owner's check): matches design 01 closely; "oda · now" fully visible; splash wordmark and tick inside Android 12+'s circular safe zone.
- CI green: **pass**, `467d162` (format, lint, typecheck, migrate, unit tests, web build, Playwright smoke, Expo SDK dependency check, expo-doctor).

**Done today (after the machine crash)**
- Recovery check: no repo damage; `oda-postgres` restarted; all checks green.
- EAS build `8add4aac` failure explained and fixed: auto-installed Reanimated 4.7.0 vs the forced Worklets 0.10.1. Reanimated, Worklets and Gesture Handler are now direct deps at SDK 57 versions; Worklets override removed; new CI step `deps:check` catches transitive mismatches (#24).
- Android builds moved from EAS cloud to local Gradle (#23), EAS kept as fallback. Windows build fixes: NDK 27.1 reinstalled (the crashed build had left it empty); ninja 1.12.1 for paths over 260 characters (#28); memory limits 2560m heap, 1 worker, Kotlin in-process (#29, #30). APKs are published as GitHub pre-releases (`m0-preview-1`, `m0-preview-2`).
- Postgres 18 everywhere to match Neon (#25). Neon `oda-staging` (Frankfurt). Vercel project `oda` (root `apps/web`, Node 24.x, `fra1`, corepack on for Production + Preview); Production and Preview share the staging DB until M11 (#26). Workflow `migrate-staging` with secret `NEON_STAGING_DATABASE_URL_UNPOOLED` (#27).
- Welcome screen fixes from the device check: clipped "oda · now" label; splash `imageWidth` 200 → 160 dp (farthest pixel 0.293 of the canvas vs 0.333 safe radius, measured inside the APK).
- Dev-loop fixes: `oda-postgres` restarts with Docker; `pnpm dev:stop`; Expo's generated `expo-env.d.ts` excluded from Prettier.
- Docs: CLAUDE.md Commands (local APK build, wireless debugging, `deps:check`, `dev:stop`, staging migrations) and a Working-style rule against hiding check exit codes; design-changes.md + M2 acceptance for the animated welcome illustration and the tick-on-baseline fix.

**Deviations**
- No EAS cloud build; the device check used locally built release APKs signed with the debug keystore (testing only).
- R2 staging bucket moved to M2 (#22).
- Postgres 18 instead of 17 (#25).

**Carried forward**
- On merge: first `migrate-staging` run (Neon has no tables until then); check the public Production `/api/health` and confirm `fra1` from the `x-vercel-id` header.
- `PUBLIC_SHOP_BASE_URL` not set in Vercel (not used before M4).
- Before M1's tables are used on staging: Vercel deploys and `migrate-staging` run in parallel (#27).
- M2: welcome animation; green tick on the "oda" baseline; Sign in / Create new shop wired; first dev-client build with Metro on the phone.
- M11: release builds add `armeabi-v7a` (#23) and a real signing key; production Neon project on Postgres 18.
- `packages/shared` holds only money formatting; state machine, pricing, phone and slug utils are M1 scope.

**Gate review (owner): M0 passed.** Outcomes in decision #31: backup + R2 check moved to M2; preview URL accepted for M0 (Production checked after merge); one EAS cloud build in M2; M1 adds the Android setup script and the migrate/deploy race fix. `milestones.md` updated.

**Open questions**
- Doc ambiguities from the M0 plan (§10): the owner answers them before M2.

**Next:** merge PR #1, tag `m0-done`, check `migrate-staging`, Neon and the Production deployment; then M1.

## 2026-09-30 · M0 Foundations (in progress, branch `m0-foundations`, PR #1)

**Done**
- pnpm 12 + Turborepo workspace: `apps/web`, `apps/seller`, `packages/shared`, `packages/ui-tokens`, `packages/db`. Strict TS 6, ESLint 9, Prettier, Vitest 5, Playwright 1.63.
- `@oda/ui-tokens`: colours, type, radii, sizes measured from `design/` (method + sample coordinates in `packages/ui-tokens/README.md`); Tailwind 4 theme generated from the same file, with a drift test.
- `@oda/db`: Drizzle 0.45 + `pg`, migration pipeline (baseline migration only; tables are M1), Docker Postgres 17 on port 5442 with an extra `oda_test` database. `pnpm db:reset` rebuilds from zero.
- `apps/web`: Next 16 + Tailwind 4, Poppins, placeholder page, `/api/health` (`select 1`; 503 when the DB is down, verified). Playwright smoke at 390×844 checks the font, brand colour and health.
- `apps/seller`: Expo SDK 57 + Expo Router, Android only, light only, Poppins; static welcome screen (01); adaptive icon, icon and splash generated from `design/app/app-icon.png`; `eas.json` with development + preview profiles. expo-doctor 21/21. Metro bundles for Android with pnpm's isolated layout.
- `pnpm dev` starts web (3000) and Metro (8081) together (verified).
- GitHub repo `dennismugu7/oda` (private), CI workflow (format, lint, typecheck, migrate, tests, web build, Playwright, expo-doctor).
- CLAUDE.md Commands filled in; decisions 17–21 appended.

**Deviations**
- ESLint 9, not 10 (Next's lint plugins don't support 10 yet).
- Local Postgres on port 5442: a native Postgres already listens on 127.0.0.1:5433 on this machine.
- Welcome screen: "Payment checked" chip → "M-Pesa till checked", "KES 2,500" → "KSh 2,500" (plan Q4 default). Buttons are static until M2.
- Web spacing uses Tailwind's numeric 4px scale instead of named tokens (named ones collide with `max-w-md` etc.; decision 19).
- Playwright saves a screenshot for design comparison instead of a pixel baseline (font rendering differs between Windows and CI Linux).

**Design comparison**
- Web placeholder: no design exists for it (landing page is M4); it uses the tokens and matches the brand in 01-welcome/web 01.
- Welcome (01): pending the Android run.

**Open**
- Staging: Neon `oda-staging`, Vercel project, Expo account / `eas init`.
- Android run: EAS cloud development build (the local Gradle build was stopped when the machine ran low on memory; not retried).
- Cloudflare R2 bucket `oda-staging` is deferred to M2, where uploads first need it.
- Doc ambiguities listed in the M0 plan (§10) still need answers before M2–M8.

## 2026-09-30 · Planning complete
- Spec, lifecycle, data model, design changes, milestones and decisions written.
- Backend switched from Supabase to Neon + Better Auth + Cloudflare R2 (decision 16).
- Next: M0 Foundations.
