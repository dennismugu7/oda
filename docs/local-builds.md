# Local builds and manual jobs while GitHub Actions is unavailable (decision #113)

Temporary. GitHub refuses every Actions job (billing), so nothing below happens on its own.
Delete this page (and revert #113) once Actions runs again. Nothing here is merged, built for
release or uploaded without the owner's go.

## 1. Merging

A PR merges once `pnpm check:all` passes locally on its branch (`E2E_PORT=3200 pnpm check:all`
if port 3100 is taken). The PR description records the commit, the date and the result.

## 2. Memory before a long run

`check:all` (Next build, Playwright, Metro bundle) and a Gradle release build each need ~8–10 GB.
Run them one at a time, never together.

- Before either: close Chrome (or most tabs), Photos, Notepad windows you don't need.
- `check:all` needs Docker (Postgres for the db tests). A Gradle build doesn't: quit Docker
  Desktop first (frees `vmmem` + `vmmemWSL`, ~3 GB).
- Gradle limits live in `~/.gradle/gradle.properties` (6 GB heap, 6 workers). For the AAB
  (two CPU types) use 4 workers if memory is short: add `--max-workers=4` to the Gradle line.

## 3. Release signing (Play upload key)

The upload key is EAS-managed (credentials `wZQg7G2ndc`). A copy downloaded with
`eas credentials` is at `C:\Users\denni\oda-keystore-backup\` (`keystore.jks` +
`credentials.json`, outside the repo). If it is gone (launch checklist L3), download it again:

1. `cd apps/seller`, `pnpm exec eas credentials -p android`
2. Build profile **production** → **credentials.json: Upload/Download credentials** →
   **Download credentials from EAS to credentials.json**.
3. Move `credentials.json` and `credentials/android/keystore.jks` out of the repo, into one folder,
   and edit `keystorePath` in the JSON to `keystore.jks`.

Signing reads that file in place (`plugins/withLocalSigning.js`), so the passwords are never copied:

```
export ODA_LOCAL_SIGNING='C:\Users\denni\oda-keystore-backup\credentials.json'
```

`*.jks`, `*.keystore`, `credentials.json` and `.env.*` are gitignored.

## 4. Production values for the app

EAS builds take `EXPO_PUBLIC_*` from EAS's **production** environment; a local build must get them
the same way (otherwise it would use `.env.local`'s local addresses):

```
cd apps/seller
pnpm exec eas env:pull --environment production --path .env.production.local
```

## 5. Version codes

- `version` (versionName and runtime) stays **0.5.0** while only JS changes.
- versionCode: EAS's remote counter is at **5** (the 0.5.0 production APKs). Each local build
  takes the next number, given to the script; after a build, set EAS's counter to it so a later
  EAS build never reuses it: `pnpm exec eas build:version:set -p android` (enter the number).
- Play: the last code built for Play is 3 (0.4.0 AAB); check Play Console → App bundle explorer
  for what was actually uploaded. Play needs every upload higher than the last.

## 6. Building

```
pnpm --filter @oda/seller build:apk 6   # release APK, arm64, for the owner's phone
pnpm --filter @oda/seller build:aab 7   # signed AAB, arm64 + armv7, for Play
```

The script refuses without the signing key, `.env.production.local` (https addresses, Google
client ID) or a clean git tree. It runs `expo prebuild --clean` with the versionCode and the
production update channel, then Gradle. Output stays in `apps/seller/android/app/build/outputs/`.

**Updates:** runtime = app version (0.5.0) and channel `production`, like the EAS 0.5.0 APK. No
update has been published to `production` for runtime 0.5.0, so the build runs its own JS. If
one is published later, the build takes it only when it's newer than the build's own JS. A dev
build (no `ODA_UPDATES_CHANNEL`) asks for no channel and runs its own JS.

**Installing over the 0.5.0 APK:** same package, same upload key, higher versionCode → installs
as an update and keeps the sign-in. Google sign-in keeps working (same key, same SHA-1).

## 7. What the workflows did, now by hand

| Workflow | What it did | By hand |
| --- | --- | --- |
| ci | checks on PRs and `main` | `pnpm check:all` locally (section 1) |
| migrate-staging + deploy | after CI on `main`: migrate Neon staging, re-apply `oda_app` grants, deploy staging via its Deploy Hook | **Vercel → oda → Deployments → Redeploy** the latest `main` commit. A PR with a migration needs Neon staging migrated first: no Neon credentials on the laptop, so hold such PRs until Actions is back (or the owner decides) |
| release-production | fast-forward `production`, migrate, deploy | Hold. production-guard can't run either |
| eas-update-preview / -production | publish JS with Sentry source maps | Hold; ship JS in a local APK instead |
| cron-expire-orders (hourly) | `POST /api/cron/expire-orders` (Bearer `CRON_SECRET`) | awaiting-payment orders don't expire on time; same for production |
| cron-purge, cron-digest (daily) | `POST /api/cron/purge`, `/api/cron/digest` | paused; catch up when Actions returns |
| backup (02:30 / 02:50), backup-restore-check | encrypted `pg_dump` to Blob | **no backups**: Neon's own point-in-time restore is the only safety net meanwhile |
| demo-seed, backdate, regression, ops tools | manual tools | unavailable |
