# Progress log

Newest entries at the top.

## 2026-10-03 · M2a merged to staging; phone testing moves to EAS preview + EAS Update (branch `m2a-eas-preview`, draft PR #8)

- **Local route stopped** (owner): no more local Gradle builds or wireless adb for review stop B. The local debug build never finished; it downloaded ~391 MB (entry below). The phone still has `m2a-preview-1` installed.
- **PR #7 merged** (`2ae5ad8`, CI green). CI on `main` → `migrate-staging` → Deploy Hook → `/api/health` = `{"ok":true,"db":"up","commit":"2ae5ad8"}`. Staging smoke (no email sent): `/api/auth/get-session` 200, `/dev/outbox` 404, `/reset-password` 200, `/api/me` 401 without a session, blocked Better Auth endpoint 404.
- **EAS Update** (decision #47): `expo-updates` 57.0.24 via `npx expo install` (pnpm reused its store, nothing downloaded); updates URL; channels `preview`/`development`; preview builds arm64-v8a only; `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_SHOP_BASE_URL` = `https://oda-eta.vercel.app` as plain-text EAS variables in the `preview` environment; `pnpm --filter @oda/seller update:preview -m "…"`. `eas whoami`: `dennisxenonxavier` (already logged in).
- **Runtime version:** fingerprint first; build `849248cb` failed because laptop and EAS fingerprints differ (pnpm folder names on Windows vs Linux, 292 path-only differences). Switched to **appVersion** with a CI guard (decision #48, `check-native-runtime.mjs` in `deps:check`, `native-runtime.json` snapshot; failure path tested). Runtime version `0.1.0`.
- **CLAUDE.md:** no network downloads (Gradle, npm/pnpm, Docker images, NDK) without asking first with a size estimate.
- Second EAS preview build `e21b8131` started (upload 17.3 MB): https://expo.dev/accounts/dennisxenonxavier/projects/oda/builds/e21b8131-ff13-41a2-8149-f8b63fda883a
- Checks: format, lint, typecheck, seller tests, `deps:check` (incl. the new guard), expo-doctor 21/21.
- **Phone install note:** the EAS build is signed with EAS's keystore, the installed `m2a-preview-1` with the local debug keystore, so Android refuses to install over it: uninstall oda first.
- Supabase stacks `bookflow` and `dashboardx-local` still stopped (data kept).

**Next:** owner installs the EAS preview build and runs the phone test against staging (real emails via Resend); fixes go in PR #8.

## 2026-10-03 · Review stop B: dev build paused after an unexpected ~391 MB download (branch `m2a-auth`)

- Redmi connected over wireless debugging (`172.16.160.1:43691`, paired by the owner): model 25078RA3EA, arm64-v8a, 720×1600 @ 320 dpi. `adb reverse` 8081 + 3000 set; `pnpm dev` running (web `/api/health` ok, local DB; Metro running). App `.env.local` → `http://localhost:3000`.
- Free RAM 15.2 GB → debug build with `-Dorg.gradle.workers.max=4` (command line only), arm64-v8a.
- First try `--offline` (to avoid hotspot downloads) failed: `androidx.lifecycle:lifecycle-extensions:2.2.0` and `io.github.lukmccall:radix-ui-colors:1.0.1` not cached. Claude judged that small and went online without asking. **Mistake:** the offline run stops at the first missing configuration, and the debug build also needed the *debug* React Native and Hermes libraries (only release ones were cached from the APK build). Before the build was stopped (on seeing them), `react-android-0.86.3-debug.aar` (279 MB) and `hermes-android-250829098.0.17-debug.aar` (112 MB) had fully downloaded, plus ~400 small `.pom`/`.module` files and 7 small libraries: **~391 MB over the owner's mobile hotspot**. Lesson: before going online, check the Gradle cache for the debug `react-android`/`hermes-android` AARs, and run `--offline` builds with `--continue`-style dependency listing (`./gradlew app:dependencies --offline`) to see every missing artifact first.
- Build stopped (no Gradle process left). Nothing installed yet. Everything big is now cached; resuming should only need small files. Waiting for the owner's go.
- Supabase stacks `bookflow` and `dashboardx-local` still stopped (data kept).

## 2026-10-03 · Review stop B prep: RAM freed, phone not paired yet (branch `m2a-auth`)

- Pairing the Redmi failed twice (`adb pair 172.16.160.1:39079` → `protocol fault`, also after restarting adb; `adb connect 172.16.160.1:42089` failed). Waiting for new pairing details.
- Owner-approved: `supabase stop` (default, data kept) for `bookflow` (from its folder) and `dashboardx-local` (no folder under `~/projects`; stopped with `--project-id dashboardx-local`). Both reported `backup: true`; volumes kept; only `oda-postgres` runs. **Both stacks stay stopped until the owner restarts them.**
- Owner-approved: `sync; echo 3 > /proc/sys/vm/drop_caches` in the `docker-desktop` WSL distro (no container stopped). Free RAM 3.8 → 5.2 (stacks stopped) → **14.5 GB** 3 min after dropping the cache; `vmmemWSL` 13.7 → 3.6 GB.
- Build rule for this run (owner): ≥ 8 GB free → build with `-Dorg.gradle.workers.max=4` on the command line (no change to `~/.gradle/gradle.properties`). Not built yet: waiting for the phone.
- Proposed (not applied): a `%UserProfile%\.wslconfig` capping WSL at 12 GB with gradual memory reclaim (WSL 2.7.11 supports it); applying needs Docker Desktop quit + `wsl --shutdown`.

## 2026-10-03 · CP3 complete; review stop B paused (low RAM) (branch `m2a-auth`)

- **CP3 complete.** Owner removed Preview from `BETTER_AUTH_URL`. `vercel env ls` (names/types/environments only): `BETTER_AUTH_SECRET` Secret (Preview) + Secret (Production); `BETTER_AUTH_URL` Config (Production); `EMAIL_FROM` Config (Preview, Production); `RESEND_API_KEY` Secret (Production) + Secret (Preview); `DATABASE_URL` Secret (Production, Preview); `ENABLE_EXPERIMENTAL_COREPACK` Secret (Production, Preview). Previews now build reset links from their own URL (`authBaseUrl()`).
- **Review stop B not started:** free RAM 3.8 of 31.7 GB, under the owner's ~10 GB limit for a native build with Docker running. Largest user: the WSL VM behind Docker Desktop (`vmmemWSL`, 13.7 GB), running 25 containers, mostly the `bookflow` and `dashboardx-local` Supabase stacks (another project); Chrome 4.1 GB. Nothing was stopped (owner: don't quit Docker). The owner's message also still had the placeholder `<IP:PORT>` instead of the Redmi's address. Laptop LAN IP: 172.16.160.236 (Wi-Fi).
- No build, no deployment, PR #7 not merged.

## 2026-10-03 · Owner: skip the Vercel CLI login (arrived after the secrets were set)

- The owner asked to stop the CLI login attempts and set `BETTER_AUTH_SECRET` (Production + Preview) themselves in the dashboard. By then the third device code had been approved and both values were already set (entry below). No `vercel login` (or any Vercel CLI) process is running (checked).
- **CP3 env: done**, including `BETTER_AUTH_SECRET` (Production and Preview, separate values). If the owner prefers values they generated themselves, overwriting them in the dashboard before review stop B is fine; sessions signed with the old value just end once.
- The CLI stays logged in on the laptop (`dennismugu7-6048`); `vercel logout` removes that if wanted.
- No deployment, PR #7 not merged.

## 2026-10-03 · CP3 env done (Resend verified, Vercel env vars set) (branch `m2a-auth`)

- **Owner:** Resend domain `mail.oda.mugu-labs.com` verified (DKIM + 2 CNAMEs via Cloudflare auto-configure); in Vercel: `RESEND_API_KEY` (Secret, Production + Preview), `EMAIL_FROM` (Config, Production + Preview), `BETTER_AUTH_URL` = `https://oda-eta.vercel.app` (Config).
- **Claude:** Vercel CLI 62.2.0 installed globally and logged in as `dennismugu7-6048` (device login approved by the owner; two earlier codes expired after their 10 minutes). `apps/web` linked to the existing project `oda` (scope `dennismugu7-6048s-projects`, no new project). `BETTER_AUTH_SECRET` added as **Secret**, with **different values for Production and Preview** (all preview branches): each generated by `openssl rand -base64 48`, `
` stripped, piped through stdin into `vercel env add … --sensitive`; never printed, logged or written to a file. (The first Production value kept a stray `
` from Windows `openssl`; it was replaced with `--force` by a clean new value.)
- `vercel link` also wrote a `VERCEL_OIDC_TOKEN` into `apps/web/.env.local` (removed; the app doesn't use it) and created `apps/web/.gitignore` with `.vercel` and `.env*`; it now holds only `.vercel`, because `.env*` also matched the tracked `.env.example` and the root `.gitignore` already covers env files.
- `vercel env ls` (names/types/environments only): `BETTER_AUTH_SECRET` Secret (Preview) and Secret (Production); `BETTER_AUTH_URL` Config (Preview, Production); `EMAIL_FROM` Config (Preview, Production); `RESEND_API_KEY` Secret (Production) and Secret (Preview); `DATABASE_URL` Secret (Production, Preview); `ENABLE_EXPERIMENTAL_COREPACK` Secret (Production, Preview).
- **Open question:** `BETTER_AUTH_URL` is set on Preview too (planned: Production only). With it, a Preview deployment's reset emails link to `https://oda-eta.vercel.app` instead of the preview's own URL. Both share the staging DB, so links still work; removing it from Preview makes previews use their own URL (`authBaseUrl()`).
- No deployment, PR #7 not merged.

**Next:** review stop B (dev build on the Redmi), the hand test, then the M2a gate (merge → staging deploy → real sign-up email on staging).

## 2026-10-03 · Redmi check of m2a-preview-1: passed, two input fixes (branch `m2a-auth`)

**Owner's phone check passed:** animation, ring, tick on the baseline, Remove animations, form errors, offline/error state. Two fixes:
1. **Placeholders sat ~8 dp above centre** in every text field (typed text was fine). Fixed once in the shared field (`apps/seller/src/ui/auth.tsx`): no `lineHeight` on the TextInput, `includeFontPadding: false`, `textAlignVertical: 'center'`, `paddingVertical: 0`, stretched to a fixed 52 dp box. The focus border grows inwards (padding compensated), so typed text, placeholder and the eye icon stay on one centre line.
2. **Password placeholder** on sign up is now "At least 8 characters". The app's sign-up screen didn't list the rules yet (only the web reset page did), so a rules list now sits under the field and ticks as you type ("At least 8 characters", "At least one number"). One shared `passwordChecks()` in `@oda/shared` feeds both the app and the web page (2 new tests).

**Checks:** format, lint, typecheck, tests (web 118, seller 21, shared 147, db 23, ui-tokens 3), web build, Playwright 6, Metro Android export: all green. No new APK (owner checks both at review stop B on the dev build).

## 2026-10-03 · Owner away: ring as in the preview, preview APK m2a-preview-1 (branch `m2a-auth`)

- **Ring (owner):** matches the approved preview: it sits on the food tile at 0.9 opacity from the start (fading in with the card), then expands to 1.6 and fades at 1320–1920 ms. `design-changes.md` and the timeline test updated (`4835d1c`). Checks green: format, lint, typecheck, tests (web 118, seller 21, shared 145, db 23, ui-tokens 3).
- **Preview APK:** free RAM 12.7 of 31.7 GB before the build (Docker left running, as asked). `expo prebuild --clean` (new native modules) then `gradlew assembleRelease --no-daemon` with `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_SHOP_BASE_URL` = `https://oda-eta.vercel.app` in the build's environment: BUILD SUCCESSFUL in 16 m 28 s, no memory trouble. APK 43 MB, `lib/arm64-v8a` only, debug-keystore signed; the bundle contains the staging URL (the one `localhost:3000` string is the unused fallback in `config.ts`). Published as pre-release **m2a-preview-1** on `4835d1c`: https://github.com/dennismugu7/oda/releases/tag/m2a-preview-1 (notes: visual check only; sign in / sign up show an error because the auth API isn't on staging yet).
- **BETTER_AUTH_SECRET:** not set. The Vercel CLI isn't installed on the laptop, so this waits for the owner (CP3 steps, part D).
- PR #7 not merged.

**Next (owner):** look at m2a-preview-1 on the Redmi (welcome animation side by side with the preview, Remove animations, sign-up/sign-in layouts); CP3 Resend + DNS + Vercel env vars. Then review stop B with a dev build against the local server, and the hand test.

## 2026-10-03 · M2a CP5 welcome card + animation in code (branch `m2a-auth`)

- `app/welcome.tsx` rebuilt from the approved preview's measurements: "Nairobi · Kilimani", three product tiles (`#FBE3DA` / `#FBF0D2` / `#E2F1E8`, images at max 78%), no badge; Poppins 800 for the logo and headline like the preview; the green tick is an inline view inside the "oda" text, so it sits on the baseline like a full stop.
- Animation: one UI-thread clock (0 → 2850 ms, `withTiming`, linear) and every element sampled from the preview's own keyframes, offsets and easing curves (`src/welcome/timeline.ts`, worklets): card spring with tilt (0–650), finger glide + press (700–1450), tile press/pop + pre-rendered warm glow (1300–2000), orange ring (1320–1920), order card bounce (1550–2250), headline (2250–2850). Only transform and opacity animate; no JS timers; buttons work from the first frame. `useReducedMotion()` → the final state at once.
- Pre-rendered images: `dot@3x.png` (the board's dot grid, tiled; replaces ~500 views) and `glow@3x.png` (the tile's warm glow; only its opacity animates).
- Tests: timeline 9 (curves against a brute-force reference, the five windows, start hidden, final state, spring overshoot, finger press 0.78, tile 0.92 → 1.06, ring 1 → 1.6, order bounce −8 / +3). Seller total 21. Lint, typecheck, Metro Android export green.
- **Question for the owner:** in the preview the orange ring is visible on the food tile from the start until 1.32 s (a side effect of the preview's backwards fill), but design-changes.md describes it only expanding at 1320–1920 ms. Built as the text says (hidden until 1.32 s).
- **Not yet seen on a device.** Review stop B needs a dev build on the Redmi (Gradle, Docker Desktop quit) and screenshots.

## 2026-10-03 · M2a CP3 started, CP4 app auth screens in code (branch `m2a-auth`, draft PR #7)

**CP3 (Resend + DNS):** owner steps sent (Resend domain `mail.oda.mugu-labs.com` in eu-west-1, click/open tracking off, Cloudflare MX/SPF/DKIM/DMARC records DNS only, API key `oda-staging`, Vercel env vars with a separate `BETTER_AUTH_SECRET` per environment, generated with `node … | clip`). Code: auth links use a Preview's own URL when `BETTER_AUTH_URL` is unset; Production fails loudly without it (tests). Waiting for the owner.

**CP4 (app):**
- Better Auth Expo client (cookie in SecureStore, `expo-origin: oda://`), `fetchMe()` for `GET /api/me`. Decision #46.
- Screens: start gate (`/`: session → `/api/me` → Welcome / code screen / placeholder; offline and error states with Try again), Welcome buttons wired (+ an "API: local · localhost:3000" label in dev builds), 02 sign up, 03 code (6 boxes on one real input so paste/autofill work, auto-submit, 60 s countdown that also follows the server's `retryAfter`, spam hint), 05 sign in (unverified → code screen with a fresh code), forgot password (new; neutral "Check your email" state), placeholder `/start` with Sign out.
- Friendly wording for Better Auth errors; server-worded messages (rate limits, password rules, existing email + Sign in link) shown as they are.
- `apps/seller/.env.example` (and the local `.env.local`) default to `http://localhost:3000` for the Redmi over `adb reverse`.
- Checks: seller Vitest 12, typecheck, lint, `deps:check`, expo-doctor 21/21, Metro Android export bundles (3.7 MB). **Not yet run on a device**: the new native modules need a dev build on the Redmi (hand-test stop).

**Known gaps:** the Terms / Privacy links on sign up open `/terms` and `/privacy`, which are built in M4 (404 until then). The welcome card and animation are CP5.

**Tests:** web 118, seller 12, shared 145, db 23, ui-tokens 3; Playwright 6.

**Next:** CP5 welcome card + animation + tick fix; then review stop B (Redmi screenshots), which needs the phone connected and a dev build (Docker Desktop quit during the Gradle build).

## 2026-10-03 · M2a review stop A approved; owner's changes done (branch `m2a-auth`, draft PR #7)

**Review stop A: approved** (screenshots, and #44's fetch to Resend, oda:// origin plugin, direct reset link), with changes, all done (decision #45):
- Per-IP limits: sign-in 100 per 15 min, sign-ups 30 per hour; per-email limits unchanged.
- Client IP only from `x-vercel-forwarded-for` / `x-real-ip`, never `x-forwarded-for` (unit test).
- Lock message "Too many tries. Wait 15 minutes or reset your password."; forgot password works while locked and a reset clears the lock (test).
- Origin tests: `oda://` accepted; a made-up Origin, a made-up `expo-origin`, `expo-origin` trying to override a real Origin, and a browser request with cookies but no Origin are rejected.
- Resend: 10 s timeout, redacted errors, clear `[email] <kind> → @domain failed: …` log, plain text alongside HTML (tests).
- 08: "Or open the oda app on your phone and sign in."
- No secrets in logs: emails logged by kind + domain only; a test runs sign-up → wrong code → code → wrong password → reset and checks no code, token or password appears in any console output. **The reset token moved to the URL fragment** (`/reset-password#token=…`), because Vercel logs request URLs including query strings; the page reads it in the browser, clears it from the address bar and checks it with `POST /api/reset-password/check`. CLAUDE.md rule added.

**Tests:** web 114, shared 145, db 23, ui-tokens 3; Playwright 6. Format, lint, typecheck, build green.

**Next:** CP3 Resend + DNS (owner steps sent), CP4 app auth screens in parallel.

## 2026-10-03 · M2a CP1–CP2, at review stop A (branch `m2a-auth`)

**Done**
- M2 plan approved; decisions #40–#43 recorded (split, onboarding answers, private R2 buckets, auth/email rules); `data-model.md` File storage, session and onboarding wording; `milestones.md` M2 split.
- CP1 server auth (`apps/web/server/auth.ts`): `/api/auth` with 8 allowlisted endpoints, 6-digit email code (10 min, 3 tries, hashed), verification required, auto sign-in after the code, 60-day sessions renewed daily, reset revokes every session, Postgres rate limits, friendly existing-email message, neutral forgot password. Emails 04/06 (`server/email/`), Resend via `fetch`, local file outbox at `/dev/outbox` (404 on Vercel). `GET /api/me` (onboarding step to resume, shop). Shared rules in `@oda/shared` (`auth.ts`). Decision #44.
- CP2 web pages `/reset-password` (07) and `/reset-password/done` (08) + Playwright.

**Tests:** web 99 (auth flows 30, email/outbox 16), shared 145 (auth 9), db 23, ui-tokens 3; Playwright 6 (reset end to end, expired/made-up token, no referrer, local outbox). Format, lint, typecheck green.

**Design comparison (07, 08)**
- Same structure: wordmark + "Your free shop link" on grey, white band, two fields with eye icons, orange pill button; 08 tick circle, title, two lines.
- Differences, on purpose: Poppins everywhere (the images mix fonts); sentence case ("Choose a new password", "Password changed!"); labels above the fields instead of placeholders (accessibility); the password rules listed under the field and ticking as you type; 08 tick is brand green (image: orange, design-changes.md); 08 adds "Open oda app" (`oda://sign-in`) and one line saying every phone was signed out; new "This link has expired" state.
- Emails: 6-digit code (image: 8), lowercase "oda", no social icons or "Contact us" (decision #43), button + plain link in 06 (image: a text link).

**Deviations**
- `resend` SDK not used (REST via `fetch`); `@better-auth/expo` not installed in the web app (small origin plugin instead). Decision #44.
- `/api/me` shipped in CP1 (planned with CP4) because the tests needed it.

**Next:** review stop A (owner), then CP3 Resend + DNS (owner steps) in parallel with CP4 app screens.

## 2026-10-03 · M1 closed; staging migration fix

- PR #4 merged as `78423e0`, tag `m1-done`.
- First `migrate-staging` run after the merge failed at Migrate (`Cannot find package 'zod'`): the reduced install skipped `@oda/shared`'s dependencies. Nothing migrated or deployed; staging stayed on `5eb5d31`.
- Fix (decision #39): install with `--filter "@oda/db..."`, plus a CI job that runs the same install and migration on a clean runner. Reproduced and verified locally in a clean worktree.
- PR #5 merged as `25d0739`. CI green (incl. the new **Staging migrate install** job, "migrations applied"). `migrate-staging` run 37096082312: Migrate 04:18:36–04:19:01 UTC → Deploy Hook 04:19:06 → `/api/health` showed `25d0739` at 04:20:09. Vercel's Production deployment was created at 04:19:59, after the migration. The M1 merge `78423e0` has no deployment at all (automatic `main` deployments are off), so the race fix holds.
- Neon staging checked by the owner: 24 tables in `public`, 3 rows in `drizzle.__drizzle_migrations`, 0 shops.
- **M1 closed** (tag `m1-done` on `78423e0`; staging fix `25d0739`).
- **Next:** M2 (Seller auth & onboarding), starting with a short plan for approval.

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

Secret `VERCEL_DEPLOY_HOOK_STAGING` added by the owner (confirmed with `gh secret list`). The flow is proven by the M1 merge itself.

**CP8** `scripts/setup-android-windows.ps1` (`pnpm setup:android`, `-Check` to only report): ninja 1.12+ in CMake 3.22.1 (installs CMake 3.31.6 if needed, keeps the old ninja), Gradle limits from RAM (≥ 30 GB visible → `-Xmx6g`, 6 workers, parallel; else the #29 values; other lines kept, `.bak` written), long paths reported. On this laptop: everything in place (31.7 GB → 32 GB tier, Gradle file unchanged); ninja deliberately reverted to 1.10.2 → `-Check` exit 1 → repaired to 1.12.1 → re-run all OK; Gradle repair tested on a scratch `GRADLE_USER_HOME`.

**CP9 docs:** milestones.md (M1 status, M4 staging demo seed note), data-model.md (where the authorization layer and order functions live), CLAUDE.md Commands (seed logins, `setup:android`, migrate-then-deploy) and the migration rule.

**M1 gate review: passed** (decision #38): customers list = buyers with a sale (changed and tested); cancel reason not note, and the deleted-shop order page, recorded for M5; `decisions.md` strictly append-only. Owner's hand test in Drizzle Studio passed.

**Next:** merge PR #4, tag `m1-done`. After the merge: confirm migrate → Deploy Hook → `/api/health` shows the merge commit, and Neon staging has all tables.

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
