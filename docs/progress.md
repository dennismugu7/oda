# Progress log

Newest entries at the top.

## 2026-10-01 · M0 Foundations, after the machine crash (branch `m0-foundations`, PR #1)

**Recovery check**
- No damage: `git fsck` clean, no lock files, working tree clean, branch pushed (`3c73dee`), CI green on it. `node_modules` intact. `oda-postgres` was left Exited (255); `pnpm db:up` brought it back with its volume. All tests pass uncached; lint, typecheck, format and expo-doctor (21/21) pass.

**Done**
- Found why EAS build `8add4aac` failed: Gradle task `assertWorkletsVersionTask`, "Worklets 0.10.1 is not compatible with Reanimated 4.7.0". Reanimated, Worklets and Gesture Handler are now direct seller dependencies at SDK 57 versions (4.5.1, 0.10.1, ~2.32.0); the Worklets override is removed (decision #24). Gesture Handler 3.3.0 was a second, not-yet-failing mismatch of the same kind.
- New CI step `pnpm --filter @oda/seller deps:check`; checked against the old lockfile, it fails on Reanimated 4.7.0 and Gesture Handler 3.3.0.
- Builds switch from EAS cloud to local Gradle, with EAS kept as a fallback (decision #23). Memory caps are in `~/.gradle/gradle.properties`; dev builds are arm64-v8a only; release builds (M11) must add armeabi-v7a.
- CLAUDE.md Commands: local build, deps check, wireless-debugging connect/reconnect steps.
- Neon `oda-staging` created (Postgres 18, AWS eu-central-1 Frankfurt, no Neon Auth). Local Docker and CI moved to Postgres 18 to match (decision #25); local DB rebuilt with `pnpm db:reset` (18.6, `oda` + `oda_test`); all tests, lint, typecheck, format and Playwright pass uncached.

**Deviations**
- Android run moves from EAS cloud to local (supersedes the 2026-09-30 "Open" note).

**Open**
- First local build + welcome screen (01) on the Redmi 15c, and design comparison.
- Staging migrations: workflow `migrate-staging` (decision #27) replaces the parked `.env.staging.local` step. Needs repo secret `NEON_STAGING_DATABASE_URL_UNPOOLED`; first runs when PR #1 merges to `main`. Neon has no tables until then.
- Vercel project `oda` (root `apps/web`, Node 24.x, region `fra1`, pooled Neon `DATABASE_URL` for Production + Preview, decision #26). **Stable preview address for the M0 branch: https://oda-git-m0-foundations-dennismugu7-6048s-projects.vercel.app** (behind Vercel Authentication); `/api/health` returns `db: up` there. An earlier failure was a bad `DATABASE_URL` paste, re-pasted. `ENABLE_EXPERIMENTAL_COREPACK=1` is set for Production only; add it to Preview too. `PUBLIC_SHOP_BASE_URL` still to set. Doc ambiguities from the M0 plan (§10) still open.

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
