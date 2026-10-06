# oda: instructions for Claude Code

oda gives Kenyan social sellers a free shop link. Sellers run their shop from an **Android app**; buyers order through a **mobile web shop**, paying the seller directly on M-Pesa. Read `docs/spec.md` first.

## Source of truth (read before any work)
1. `docs/spec.md`: what we're building
2. `docs/order-lifecycle.md`: order state machine + money rules
3. `docs/data-model.md`: database design
4. `docs/design-changes.md`: screen index + where to deviate from the images (**overrides the images**)
5. `design/app/*.png`, `design/web/*.png`: visual reference. Open the relevant images before building any screen.
6. `docs/milestones.md`: build order + acceptance criteria
7. `docs/decisions.md`: why things are the way they are (append-only)
8. `docs/progress.md`: running log; update it at the end of every task

If these conflict or are unclear, **stop and ask**. Don't guess on product behaviour.
**These repo docs are the only source of truth.** Don't rely on old plan files or past conversations (e.g. `~/.claude/plans/*`); anything decided there is recorded in `docs/decisions.md`.

## Stack
pnpm + Turborepo · Expo (Android) · Next.js + Tailwind · Neon Postgres + Drizzle · Better Auth (email + password + email OTP) · Cloudflare R2 (presigned uploads) · Resend · Expo push · Sentry · GitHub Actions (CI, cron, backups) · Vercel · EAS. **No Supabase.** See `docs/decisions.md` #10 and #16.

## Repo layout
```
apps/web        Next.js (App Router) + Tailwind: buyer shop, order pages, legal pages, API + jobs (no /admin: decision #72)
apps/seller     Expo (React Native, Expo Router): Android seller app
packages/shared zod schemas, types, pricing, order state machine, phone/money/slug utils
packages/ui-tokens  colours, typography, spacing, radii (shared by web + app)
packages/db      Drizzle schema, migrations, seed (Postgres on Neon; Docker Postgres locally)
design/         screen images (read-only)
docs/           specs (keep updated)
```

## Non-negotiable rules
- **Money** is integer KES. Only `packages/shared/src/pricing.ts` computes totals, and only on the server from DB prices.
- **Order status** changes only through the shared state machine, run through `transitionOrder()` in Next.js API route handlers (see `docs/data-model.md` → "Where logic runs"). Never a raw status UPDATE anywhere else.
- **The database is server-only.** Every access goes through the authorization layer (`apps/web/server/authz.ts` + shop-scoped repositories), with automated authorization tests. Never spread request bodies into DB writes; whitelist fields with zod.
- **Buyer order access** only via `public_token`. Never expose sequential IDs in URLs.
- **Phones** stored in E.164 (+254…). **Timezone** Africa/Nairobi for any date bucketing.
- **No secrets in logs.** Passwords, email codes, reset tokens, session tokens and API keys never appear in logs, error messages or (later) Sentry events; scrub them in Sentry's `beforeSend`. Emails are logged by kind and recipient domain only, never subject or body. Reset links carry the token in the URL fragment (`#token=`), never in a query string a server could log. Decision #45.
- **No secrets in git.** Use `.env.local` + `.env.example`. DB URL, R2 keys and auth secrets are server-side only, never in the app bundle.
- **Base shop URL** comes from config: the server reads `PUBLIC_SHOP_BASE_URL`; the seller app reads `EXPO_PUBLIC_SHOP_BASE_URL` and `EXPO_PUBLIC_API_URL`. Never hardcode a domain.
- **Migrations are backward compatible** with the code already running (expand → deploy → contract): the old deployment briefly runs against the new schema. Rename or drop a column in two releases, never one. Branch previews share the staging DB, so a preview of an unmerged migration may fail until merge.
- Validate every input with zod at the boundary. Friendly, specific error messages in the UI.
- Every screen handles loading, empty and error states.
- Don't add dependencies casually. Prefer well-maintained, popular packages; note significant ones in `docs/decisions.md`.

## Working style
- Work milestone by milestone (`docs/milestones.md`). Start each task by proposing a short plan, and wait for approval on anything that changes the spec or data model.
- Small, focused commits with clear messages. One milestone = one branch → PR into `main`.
- Never pipe or chain check commands (lint, format, typecheck, tests) in a way that hides their exit code (e.g. `pnpm format:check | tail -1 && git commit`). Run each check so a failure stops the commit; only commit after every check has exited 0. **Never hide or filter check, test or build results** (grep to read docs or logs is fine; report failures with their output). Use `pnpm check:all` (see Commands).
- **Secrets:** never ask the owner to paste a secret into the chat, and never print secret values (in commands, output, docs or commits). Tell the owner the env var / secret **name** and exactly where to set it (Vercel, GitHub Actions, EAS, `.env.local`); verify by name only.
- **Review stops are hard stops:** at an agreed review stop (or "stop" / "don't start X"), stop and wait for the owner's go-ahead. Don't start the next checkpoint or milestone early.
- **Phone tests run against staging:** merge to `main` (staging) before handing the owner a phone test list, with numbered steps and expected results. The owner works from a phone: one step at a time, dashboards over CLIs. When the test uses Demo Duka, run **Actions → demo-seed-staging** after the merge (it resets the shop and remakes the sample orders; their links change every run).
- **Memory:** if Claude Code stops a command because the laptop is low on memory, stop and tell the owner; don't restart it or retry in a loop.
- **Other projects on this laptop** (bookflow, dashboardx-local: their Supabase stacks, Expo/Metro on 8099/8100, a Next server on 3100): never stop, change or start their processes, code or data without the owner's approval. While bookflow holds port 3100, run Playwright with **`E2E_PORT=3200`** (`E2E_PORT=3200 pnpm check:all`).
- **App changes:** JS-only changes ship as an **EAS Update** (`pnpm update:preview`). **No native build (local Gradle or EAS) without asking first.**
- **`docs/decisions.md` is append-only:** never edit an old entry; amend with a new numbered entry that refers to it.
- **Milestone flow:** propose a plan → owner approval → checkpoints with review stops → gate (✅/❌ with evidence against `milestones.md` + definition of done) → tag `mN-done` on `main`. Keep the Handoff section at the top of `docs/progress.md` current.
- **No network downloads without asking first, with a size estimate**: Gradle dependencies, npm/pnpm installs, Docker images, the Android NDK/SDK. The laptop is often on a mobile hotspot. An `--offline` failure lists only the first missing configuration, so check the caches (e.g. the debug `react-android`/`hermes-android` AARs, hundreds of MB) before estimating. Small npm packages for an approved step are the only exception the owner pre-approves case by case. Call the Expo CLI as `pnpm exec expo …`, never `npx expo …` (npx silently downloads Expo from npm when it can't find the local one), and run checks one after another, never in parallel (`expo install --check` rewrites packages while it runs).
- Write tests alongside code (Vitest for logic, authorization tests against a real Postgres, Playwright for web flows).
- After building a screen, compare it to its design image and list any visible differences.
- End every task by updating `docs/progress.md`: done, deviations, open questions, next step.

## Commands
Node 24, pnpm 12 (pinned in `package.json`). First run: `pnpm install`, copy each `.env.example` to `.env.local` (`apps/web`, `apps/seller`, `packages/db`), `pnpm db:up`, `pnpm db:migrate`.
- `pnpm dev`: web on http://localhost:3000 + Metro for the seller app (open with the oda dev build). Needs `pnpm db:up` first (after that, `oda-postgres` restarts with Docker). Stop with Ctrl+C; if the terminal or task was killed instead, `pnpm dev:stop` ends the Node servers left on ports 3000 and 8081 (nothing else).
- `pnpm test`: Vitest in every package (the db tests need local Postgres up and migrated).
- `pnpm test:e2e`: builds the web and runs Playwright (390×844 mobile Chromium) against it on port 3100. Playwright never reuses a server it didn't start: if another project holds 3100, run with `E2E_PORT=3200` (also `E2E_PORT=3200 pnpm check:all`).
- `pnpm lint` / `pnpm typecheck` / `pnpm format` (`format:check` in CI).
- **`pnpm check:all`**: every local check strictly one after another (format, lint, typecheck, tests, repo root, Expo deps + native runtime, Android bundle, web build + Playwright; Turbo with `--concurrency=1`), stopping at the first failure and printing each step's result. **Use it instead of running checks by hand** so they never run in parallel; run a single check alone only while fixing it.
- `pnpm db:up` / `db:down`: local Postgres 18 in Docker (same major as Neon) on **port 5442** (5433 is taken by a native Postgres on this machine).
- `pnpm db:reset`: drop the volume, start, migrate, seed (the "Amani Styles" demo shop; sign in as `amani@example.test` or `admin@example.test` with `SEED_PASSWORD` from `apps/web/.env.example`). `pnpm db:migrate` / `db:generate` / `db:seed` / `db:studio`.
- Staging web: **https://oda-eta.vercel.app** (Vercel Production deployment of `main`, public, region `fra1`; health at `/api/health`). Branch previews: `https://oda-git-<branch>-dennismugu7-6048s-projects.vercel.app` (behind Vercel login). Until M11 both use the Neon staging DB (decision #26).
- Neon staging is migrated only by the `migrate-staging` GitHub Actions workflow: after CI passes on `main` it migrates, then deploys staging through a Vercel Deploy Hook and waits for `/api/health` to show the commit (Vercel doesn't deploy `main` on push: `apps/web/vercel.json`). Manual run: Actions → migrate-staging → Run workflow. No Neon credentials on dev machines.
- Jobs on staging: **Actions → cron-expire-orders** (hourly, also manual; Bearer `CRON_SECRET`), **Actions → staging-backdate-order** (test tool: makes one awaiting-payment order look 49 h old). Removing a review: **Actions → review-remove** (review id, or shop link name + order number, and a reason; Bearer `OPS_SECRET`; audit row in `ops_events`; decision #73). Secrets are set by piping into `gh secret set` / `vercel env add` without printing, verified by name only.
- If `pnpm typecheck` fails on typed routes for a new screen, `apps/seller/.expo/types/router.d.ts` is stale: delete it (generated, gitignored; CI never has it).
- `pnpm --filter @oda/ui-tokens generate`: regenerate `theme.css` after editing `tokens.ts`.
- `pnpm update:preview "What changed"`: publish the app's JS to the `preview` channel (EAS Update, decisions #47, #50); the phone gets it after closing and reopening the app twice. Native changes need a version bump and a new EAS build instead (`deps:check` enforces it, #48).
- `pnpm --filter @oda/seller doctor`: expo-doctor, pinned as a dev dependency of `apps/seller` (no download; bump it like any other package). `pnpm --filter @oda/seller deps:check`: every installed Expo-pinned package (transitive too) matches the SDK. Add native modules with `pnpm exec expo install` (from `apps/seller`), never `pnpm add`.
- **Native builds:** always ask first. Build 0.3.0 ran on **EAS (cloud)** with the owner's go-ahead (decision #70 e; Gradle downloads happen there, the free queue can take ~2 h): `pnpm exec eas build -p android --profile preview --non-interactive --no-wait` from `apps/seller`, after `version` bump + `node scripts/check-native-runtime.mjs --write`. Ask the owner which route (EAS or local) for each new native build. Local builds (decision #23): `pnpm --filter @oda/seller android` (`expo run:android`: prebuild, Gradle, install on the connected phone, start Metro). Quit Docker Desktop first; Gradle memory caps live in `~/.gradle/gradle.properties`. Windows needs ninja 1.12+ in the SDK's CMake 3.22.1 (decision #28). `pnpm setup:android` applies and verifies this machine's setup (ninja, the RAM-based Gradle limits from decision #35, long paths); `-Check` only reports; safe to re-run, e.g. after an SDK reinstall. Standalone APK: `cd apps/seller/android && ./gradlew assembleRelease` → `app/build/outputs/apk/release/app-release.apk` (debug-keystore signed, testing only). EAS is the fallback: `eas build -p android --profile development` (from `apps/seller`).
- Phone over **wireless debugging** (Redmi 15c, same Wi-Fi). The ports change every time; read them off the phone.
  - First time only: phone → Developer options → Wireless debugging → *Pair device with pairing code*, then `adb pair <ip>:<pairing port>` and enter the 6-digit code.
  - Every time (after sleep or a Wi-Fi change): phone → Wireless debugging (main screen, *IP address & Port*), then `adb connect <ip>:<port>`, `adb devices` (shows `device`), `adb reverse tcp:8081 tcp:8081` (Metro) and `adb reverse tcp:3000 tcp:3000` (web API). If `adb` hangs, `adb kill-server` and connect again.
