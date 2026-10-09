# M11 plan: launch infrastructure (approved)

**Status: approved on 2026-10-09** with the owner's answers, recorded as **decision #93**:
- D1 as answered;
- D2–D12 as recommended;
- the onboarding change in CP2 approved;
- D13's account type still to come (see the table).

**What M11 delivers:** production running at `https://oda.mugu-labs.com` on its own database,
storage, email key and secrets. Alongside it: a signed production Android build (AAB, arm64-v8a
and armeabi-v7a), in the new orange, in Play **closed testing**, which the owner has checked by
hand on a real device (#92 d). Staging (`oda-eta.vercel.app`) stays as it is and keeps
following `main`.

**Not in M11 (the owner's):** the store listing (text, screenshots, feature graphic), pricing,
launch marketing, and moving the app from closed testing to the production track. The Play
Console's own forms (content rating, data safety, app access) are filled in by the owner. If
the owner wants it, Claude supplies an answer sheet for the data safety form (D12).

**Rules that apply throughout:**
- Changes reach `main` only through PRs, merged after every check passes. One branch per
  checkpoint.
- Review stops are hard stops.
- No secret appears in chat, logs, docs or commits. Secrets go in by name only: the owner
  enters them in dashboards, or Claude pipes a value it generated into `gh secret set` /
  `vercel env add` / `eas env:create` without printing it.
- `decisions.md` is append-only.
- Expo is run as `pnpm exec`, never `npx`.
- Native builds and downloads need the owner's go-ahead first, with a size estimate.

**Scope today (for sizing):** 16 GitHub Actions workflows, all of which point at staging
(`oda-eta.vercel.app` and `NEON_STAGING_*` are written into them); 9 migrations; app 0.3.1
(runtime 0.3.1, versionCode never bumped); EAS profiles `development` and `preview` only.

---

## How production fits next to staging (D1–D3)

```
PR → main ──CI──► migrate-staging ──► Vercel project "oda" (staging, oda-eta.vercel.app, Neon oda-staging)
                     │
       owner runs Actions → release-production (picks a main commit that is live and green on staging)
                     ▼
        fast-forward branch `production` → migrate production Neon → deploy hook →
        Vercel project "oda-production" (oda.mugu-labs.com, Neon oda-production) → wait for /api/health = that commit
```

- **A second Vercel project, `oda-production`**, using the same repository and root
  `apps/web`, in region fra1.
  - It builds only the `production` branch, and only through its deploy hook. Its ignored
    build step skips every other branch, so it never builds previews.
  - Its secrets are scoped to its Production environment only.
  - The existing `oda` project stays as staging, with nothing changed. Branch previews keep
    using staging (#26).
- **The `production` branch** is never pushed by hand. Only the release workflow moves it, and
  only by fast-forwarding to a commit that is already on `main`. A ruleset blocks every other
  push. So production always runs reviewed code that has already been on staging.
- **GitHub Environments:**
  - `staging`: the existing secrets move here, unchanged.
  - `production`: the owner must approve each run of release-production and
    eas-update-production (GitHub mobile can approve).
  - `production-jobs`: no approval step (approvals would block scheduled runs). Used by the
    cron jobs, backups and ops tools, on `main` only.
- **Workflows take a target:**
  - The scheduled jobs (expire orders, purge, digest, backup, restore check) run for both
    environments.
  - The ops tools (shop-suspend, review-remove, sentry-test) get a `staging` / `production`
    choice, with staging as the default.
  - The test tools (demo-seed, the backdate tools, staging-regression, sitting1-cleanup) stay
    staging only. A test fails CI if any of them could reach a production secret or URL.

---

## CP1 · Contract migrations + the least-privilege database role (code; staging only)

Done first so that production starts from the finished schema, and so the new role is proven on
staging before production exists.

**Claude:**
1. **Release 1 (expand → deploy):**
   - Remove `profiles.is_admin` from the Drizzle schema and from every query. The column stays
     in the database for now.
   - Change the `authz.test.ts` check "is_admin can't be written" to "there is no such field".
   - Check that nothing reads `orders_idempotency_key_unique` by name.
   - PR, then merge. Staging migrates and deploys.
2. **Release 2 (contract), in its own PR after release 1 is live:** migration 0009 drops
   `orders_idempotency_key_unique` (S12 contract, #84 a) and `profiles.is_admin` (#82 f). The
   code running on staging no longer refers to either, so dropping them breaks nothing.
3. **Least-privilege role (S11):**
   - `packages/db/sql/app-role.sql`, which can safely run more than once:
     - creates role `oda_app` with LOGIN, no CREATE, and no membership in `neon_superuser`;
     - grants it SELECT, INSERT, UPDATE and DELETE on every table, USAGE on sequences, and
       EXECUTE on our functions;
     - sets `ALTER DEFAULT PRIVILEGES` so that tables created by later migrations get the same
       grants;
     - grants nothing on `drizzle.__drizzle_migrations`.
   - The role is created in SQL, not in the Neon console: roles made in the console join
     `neon_superuser`.
   - **CI proof:** the integration and authorization tests run connected as a DML-only role
     on the local and CI Postgres. If the app still needs a privilege it doesn't have, CI
     fails. Claude also checks that nothing at runtime needs DDL (Better Auth, the rate-limit
     function, the purge).
   - **Workflow `db-app-role`** (target `staging` / `production`; manual, and also run after
     every migrate): runs the SQL with the owner connection string. The role's password comes
     from the secret `ODA_APP_DB_PASSWORD`.
4. **Staging switch (if D5 = yes):**
   - Claude generates the password and pipes it into the `staging` environment secret.
   - Claude builds the pooled `DATABASE_URL` for `oda_app`. It needs the host name, which is
     not secret. Claude pipes the URL into the Vercel `oda` project (Production + Preview)
     without printing it.
   - Claude redeploys staging and checks `/api/health`. The staging-regression run is not
     needed: health, demo-seed and one cron run show that DML works.

**Owner:** none, except approving the PRs, and (D5) giving the go-ahead for the staging role
switch.

🛑 **Review stop A:**
- staging `/api/health` on the new commit;
- migrate-staging shows migration 0009 applied;
- the `db-app-role` run is green, and its summary lists the role's grants (not its password);
- (D5) staging runs as `oda_app`, and a Claude-run check shows that `DROP TABLE` as that role
  is refused.

---

## CP2 · Production web: domain, database, storage, email, Sentry, jobs

**Claude (code, one branch):**
- The release-production workflow, the `production` ruleset settings (as owner steps), and the
  Environments split described above.
- Every workflow takes its target URL from the Environment variable `BASE_URL`. No address is
  written into a workflow any more.
- The test that keeps test tools away from production.
- Production config guards:
  - on the production project the server refuses to start with the local storage driver, the
    dev outbox or a missing Sentry DSN;
  - `PUBLIC_SHOP_BASE_URL` must be `https://oda.mugu-labs.com`;
  - the CSP `img-src` and `connect-src` are built from the configured Blob and Sentry origins.
- **Staging gets `X-Robots-Tag: noindex`** on every page; production stays indexable.
- **Production backups:**
  - `backup-production` runs nightly at 02:50 Nairobi. It writes to the private store
    `oda-production-backups` (prefix `production/`), encrypted with its own passphrase.
  - The weekly restore check also runs for production.
  - The summaries list counts only.
- **When Blob hits a Hobby limit (D1):** production stays on Hobby through closed testing, so
  Blob may stop working for 30 days. Staging's stores count towards the same Hobby account, so
  a busy staging run can also cause the stop. If it happens, everything that doesn't need a
  stored file keeps working, and the parts that do need one fail with a clear message, never
  a crash or a silent loss:
  - **Uploads** (product photos, logo, review photos, feedback screenshots): a Blob refusal
    (quota, suspended store, timeout) is answered with **503 `storage_unavailable`**: "Photo
    uploads are paused for now. Try again later." Today it would be a 500. The app and web
    show that message.
    - A product can still be created and saved without a new photo.
    - Feedback is still sent, without the screenshot.
    - A review is still posted, without photos.
  - **Onboarding:** the step that needs a first product photo lets the seller go on without
    it. Instead, the checklist item "Add a product photo" stays open. This is the only flow
    change (approved, #93).
  - **Buyer pages:** shop, product, cart, checkout, pay and order pages never wait for Blob.
    A photo that doesn't load shows the existing placeholder tile (`onError`), not a broken
    image. Checkout, order actions, push, emails and the hourly job don't touch Blob at all.
  - **The purge:** a failed Blob delete stays queued in `storage_deletions` and is retried on
    the next run. The run's summary counts the failures, and no database row is removed
    before its files are gone.
  - **Backups and the restore check:** a Blob failure makes the run fail (red, so GitHub
    emails the owner), never pass silently. While Blob is stopped, Neon's own restore window
    is the fallback. During closed testing the data is test data only.
  - **Tests:** a storage driver that refuses every call (as Blob does at a quota stop). The
    tests check the 503 and its message on every upload route; that product save, feedback,
    review and onboarding complete without files; that Playwright buyer pages and a full
    checkout pass with every image failing; that the purge keeps the queue; and that the
    backup script exits non-zero.
  - **Early warning:** the owner looks at Vercel → Usage (Blob) at every review stop and
    weekly during closed testing. Staging spends no extra Blob: staging-regression runs only
    when needed, and demo-seed reuses its images.

**Owner (dashboard steps; Claude sends them one at a time, numbered, with what you should see
after each):**
1. **Neon:** create the project `oda-production`: Postgres 18, region AWS Frankfurt
   (eu-central-1, next to fra1), plan per D4. Paste the owner connection strings (direct and
   pooled) into GitHub → Environments → `production-jobs` / `production` as
   `NEON_DATABASE_URL_UNPOOLED`. Claude then checks them by name only.
2. **Vercel:**
   - create the project `oda-production` from the repository: root `apps/web`, Node 24.x,
     `ENABLE_EXPERIMENTAL_COREPACK=1`, region fra1, plan per D1;
   - create a deploy hook for the branch `production` and save it as
     `VERCEL_DEPLOY_HOOK_PRODUCTION` in the `production` Environment.
3. **Blob (production project):**
   - `oda-production-images`: public, connected to the project;
   - `oda-production-feedback`: private, its token as `FEEDBACK_BLOB_READ_WRITE_TOKEN` in
     Vercel;
   - `oda-production-backups`: private, not connected, its token saved as a GitHub secret.
4. **Domain:**
   - in Vercel → oda-production → Domains, add `oda.mugu-labs.com`;
   - in Cloudflare DNS, add the CNAME record Vercel shows, set to **DNS only** (grey cloud);
   - wait until Vercel shows the domain as valid.
5. **Resend:**
   - create an API key `oda-production` with **Sending access** only, limited to the domain
     `mail.oda.mugu-labs.com`;
   - paste it into Vercel oda-production as `RESEND_API_KEY` (Production, Sensitive).
   (Staging's key is not touched.)
6. **Sentry:**
   - add the `oda-web` DSN and the `SENTRY_AUTH_TOKEN` (source maps) to oda-production;
   - create an alert rule: email the owner on a new issue in environment `production`.
7. **Backup passphrase:** generate it in a password manager. Paste it as
   `BACKUP_PASSPHRASE` into the `production-jobs` Environment, and keep a copy outside GitHub:
   without it the backups can't be read.
8. **Push:** an Expo access token for production (`EXPO_ACCESS_TOKEN`). The owner creates it on
   expo.dev and pastes it into Vercel oda-production. FCM keeps the same Firebase project.

**Claude (with the laptop's existing CLI logins, values never printed):**
- generates `BETTER_AUTH_SECRET`, `CRON_SECRET`, `OPS_SECRET` and `ODA_APP_DB_PASSWORD` for
  production (each different from staging's) and pipes them into Vercel and the GitHub
  Environments;
- sets the plain config: `PUBLIC_SHOP_BASE_URL`, `BETTER_AUTH_URL`, `EMAIL_FROM`,
  `ODA_SUPPORT_EMAIL`, `STORAGE_*`;
- after the owner's go, runs `migrate-production`, then `db-app-role` (production), then
  pipes the `oda_app` pooled `DATABASE_URL` into oda-production;
- runs release-production for the first time (the owner approves it in GitHub).

**Production smoke check (Claude, without making accounts):**
- `/api/health` shows the commit and the database;
- the landing page, `/privacy`, `/terms` and `/delete-account` load;
- an unknown shop answers 404 and an unknown order link 404;
- the security headers and CSP are present, there's no `noindex`, `/dev/outbox` answers 404
  and local uploads are refused;
- one run each of expire-orders, the purge (dry run), the digest (quiet day, no email),
  backup-production and the production restore check.

There is no demo shop on production, and no seed.

🛑 **Review stop B (owner, on the phone):**
1. `https://oda.mugu-labs.com` opens (landing page, padlock).
2. `/api/health` shows the commit.
3. The job runs above are green.
4. Sentry: **Actions → sentry-test (production)** arrives in environment `production`, scrubbed.
5. Neon production → Roles: `oda_app` exists, and Vercel's `DATABASE_URL` uses it (Claude
   checks this by name and host only).
6. Blob stop: the CI run with the refusing storage driver is green (the PR's checks), and
   Vercel → Usage shows Blob well under its Hobby limits.

---

## CP3 · Legal pages + the production app build

**Claude (code):**
1. **Privacy policy and terms (D9):** replace the placeholder text with drafts written from
   what the code really does:
   - data collected and why; where it is stored (Neon EU, Vercel, Blob, Resend, Sentry EU,
     Expo/FCM);
   - how long it is kept (30-day purge, backups 14 days);
   - deletion (in the app and at `/delete-account`), buyer data and contact.
   The owner approves the wording. Registration with Kenya's Data Protection Commissioner is
   the owner's step (not code).
2. **App config:**
   - `eas.json` profile `production`: AAB (`app-bundle`), channel `production`, environment
     `production`, `autoIncrement` (versionCode is managed remotely by EAS), and **no**
     arm64-only override, so the build contains arm64-v8a and armeabi-v7a.
   - `preview` keeps arm64 only.
   - If D6 = yes, the preview builds become `com.mugulabs.oda.preview`, named "oda staging",
     so both apps can be installed on one phone.
3. **Native colours (#88):**
   - In `app.config.ts`, the splash, adaptive-icon background and notification `color` read
     `primary` from `@oda/ui-tokens` instead of `#D94A27`.
   - `icon.png`, `adaptive-icon.png` and `splash-icon.png` are redrawn in #C44323 by a small
     script in the repository, using sharp, which is already installed (no download).
   - The owner sees the before/after images in the PR.
4. **Version 0.4.0** (runtime 0.4.0), `check-native-runtime.mjs --write`.
5. **EAS environment `production`:** `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_SHOP_BASE_URL` =
   `https://oda.mugu-labs.com`, plus `EXPO_PUBLIC_SENTRY_DSN`. These are public values, so
   Claude sets them with `eas env:create`.
6. **Workflow `eas-update-production`:** the same as preview but channel `production`, `main`
   only, with the owner's approval through the `production` Environment.
7. **Before any build:**
   - **`pnpm audit --prod`** re-run (#91), a small query, already approved for M10. Claude
     will ask again. Anything new is fixed or recorded in `hardening-report.md` S10.
   - Online `expo-doctor` and `pnpm check:all`.

**Then Claude asks before the native builds (D7).** EAS cloud, nothing downloaded to the
laptop:
- (a) production AAB 0.4.0;
- (b) if D6 = yes, a new preview APK 0.4.0 (`.preview`).
The free queue can take about 2 hours each.

**Owner:**
- if D6 = yes, add the Android app `com.mugulabs.oda.preview` in Firebase and replace the
  `GOOGLE_SERVICES_JSON` file variable on EAS with the new file, which lists both apps;
- **after build (a): back up the upload keystore.**
  - From expo.dev → Project → Credentials → Android, download the keystore and note the alias
    and passwords.
  - Store them in your password manager plus one offline copy. Claude never sees them.
  - Play App Signing holds the real signing key. The upload key can be reset through Play
    support, but the backup avoids that wait.

🛑 **Review stop C:**
- the privacy and terms text is approved;
- the AAB is built, and Claude shows from the bundle that it contains `lib/arm64-v8a` and
  `lib/armeabi-v7a`, version 0.4.0, and versionCode;
- (D6) the preview APK is installed next to the 0.3.1 → 0.4.0 app, with the orange icon,
  splash and notification colour on the Redmi;
- the keystore backup is done (owner says yes).

---

## CP4 · Closed testing + the real-device check (#92 d) + clean-up

**Owner (Play Console):**
- create the app if it doesn't exist yet;
- upload the AAB to **Closed testing** (the first upload must be done by hand in Play
  Console); privacy policy URL `https://oda.mugu-labs.com/privacy`, account deletion URL
  `https://oda.mugu-labs.com/delete-account`;
- add yourself as a tester, then install from the Play link on the Redmi;
- check Play's **pre-launch report** (Play tests the app automatically on several devices,
  including 32-bit ones). That is the armeabi-v7a evidence if there is no 32-bit phone (D10).

**Real-device check on production (Claude writes it as numbered steps with expected results,
about 20 minutes, one step at a time):**
1. Sign up with your real email (the code arrives from `hello@mail.oda.mugu-labs.com`).
2. Onboarding with a photo.
3. Add a delivery area.
4. Open the shop link `oda.mugu-labs.com/<slug>` in the phone's browser (link preview in
   WhatsApp).
5. Place an order as a buyer.
6. A **push arrives within 10 s**.
7. Accept → confirm payment → sent → delivered.
8. Leave a review from the order link and reply to it in the app.
9. Change the link name (the old link redirects).
10. Feedback with a screenshot.
11. Sign out and back in.
12. Delete the test shop (it gets a 404 at once). See D10.

While the owner tests, Claude watches Sentry `production` and the job summaries. Afterwards
Claude reports what the purge will remove after 30 days. Nothing is purged early on production.

**Claude (clean-up):**
- **`vercel logout` on the laptop** and remove the `apps/web/.vercel` link. This happens only
  after every Vercel variable is set; any later Vercel change goes through the owner's
  dashboard.
- Check that no production secret is in the repository, in `.env*` files or in the laptop's
  shell history (by name and pattern only).
- Update the docs:
  - `milestones.md` M11: the wording now matches what was built (Blob instead of R2, per D2);
  - `data-model.md` → "Where logic runs" / environments;
  - `CLAUDE.md`: production commands and workflows;
  - the hardening report: S11 and S12 marked fixed.

🛑 **Review stop D:** the real-device check passes (or each failure is fixed, shipped as an EAS
Update to `production` or a new build, and checked again).

**Gate:**
- ✅/❌ for each item, with evidence against `milestones.md` M11 and the definition of done;
- `m11-done` tagged on `main`;
- the Handoff is updated, with production commands and who to call for what, and the launch
  checklist below is copied into it as open owner items.

---

## Launch checklist (owner, before real sellers join; not part of the M11 gate)

The gate lists each of these as open, and so does the Handoff, until the owner closes it.

- **L1 · Vercel plan (D1):** before the first real seller is invited, either
  - upgrade the `oda-production` project to **Pro**, or
  - get **written confirmation from Vercel support** that oda's use (a free service for
    sellers, no revenue in v1, #9) is allowed on Hobby. Keep the email, and record it in
    `docs/decisions.md`.

  Until one of these is done, oda stays in closed testing.

---

## Schema changes

- Migration 0009 (contract only): drop `orders_idempotency_key_unique` and
  `profiles.is_admin`.
- No new tables.
- The `oda_app` role and its grants are applied by `db-app-role`, not by a migration, because
  the password differs per environment.

## Downloads and builds (each asked about first)

- `pnpm audit` query (CP3, small);
- 1 production AAB (EAS cloud) and, if D6 = yes, 1 preview APK (EAS cloud).
- Nothing else is expected: sharp, eas-cli 24.11 and gh are already on the laptop.

---

## Decisions (answered in #93)

| # | Question | Recommendation → answer |
|---|---|---|
| **D1** | **Vercel plan for production.** Hobby is for non-commercial use (#10), and Blob on Hobby *stops working for 30 days* when a limit is reached (#54). | **Answered (owner):** stay on **Hobby through closed testing**. CP2 makes sure a Blob stop breaks nothing ("When Blob hits a Hobby limit"). Before real sellers join: upgrade to Pro, or get Vercel support's written OK for Hobby (launch checklist L1). |
| **D2** | **Production storage:** Vercel Blob (as you listed), or Cloudflare R2 as #54 planned (needs a card on Cloudflare). | **Vercel Blob**, with no custom image domain (the database stores keys, so a later move changes only env vars). Recorded as a new decision amending #54. **Answer: as recommended.** |
| **D3** | **How production is deployed:** a separate Vercel project plus a `production` branch moved by a manual, approved release workflow. Alternative: turn the existing project's Production into real production and move staging elsewhere. | **Separate project + release workflow.** Staging keeps working with nothing changed, and production only ever runs commits already checked on staging. **Answer: as recommended.** |
| **D4** | **Neon production plan:** Free (0.5 GB, short point-in-time restore window) or Launch (paid by usage, longer restore window). | **Free to start**, with nightly encrypted backups and a weekly restore check. Upgrade when storage passes ~60% or once there are real orders you couldn't lose a day of. **Answer: as recommended.** |
| **D5** | **Switch staging to the `oda_app` role too** (S11 said staging could stay). | **Yes, in CP1, before production exists:** a missing grant then shows up on staging, not in production. **Answer: as recommended.** |
| **D6** | **Separate app id for preview builds** (`com.mugulabs.oda.preview`, "oda staging"). | **Yes.** Otherwise the Play install and the staging APK can't both be on the Redmi (different signatures), and every staging test would mean uninstalling. Cost: one Firebase step and one extra EAS build. **Answer: as recommended.** |
| **D7** | **Build route:** EAS cloud or local Gradle. | **EAS cloud** for both (#70 e): no laptop downloads or memory risk, and the keystore stays in EAS. The queue can take about 2 hours. **Answer: as recommended.** |
| **D8** | **Production email sender:** `oda <hello@mail.oda.mugu-labs.com>` (the domain staging already uses) with its own sending-only key. | **Yes, the same sender and domain, separate key.** Staging sends very little. Moving staging to its own subdomain can wait. **Answer: as recommended.** |
| **D9** | **Privacy policy and terms text.** | **Claude drafts both from what the code really does; you approve them** (and get legal review if you want it). Registering with Kenya's ODPC is your step. **Answer: as recommended.** |
| **D10** | **The real-device check:** on production, with your real email and a test shop deleted afterwards. And how to check armeabi-v7a. | **Yes, a test shop "oda test", deleted at the end** (purged by the normal 30-day job). armeabi-v7a: the libraries inside the AAB plus Play's pre-launch report, with no 32-bit phone needed. **Answer: as recommended.** |
| **D11** | **Approvals:** require your approval (GitHub Environment) for release-production and eas-update-production. | **Yes for those two.** Scheduled jobs and the ops tools run without approval (on `main` only), because an approval step would block the hourly and nightly runs. **Answer: as recommended.** |
| **D12** | **Data safety form:** do you want a written answer sheet (data types, purposes, sharing, encryption, deletion), taken from the code? | **Yes, `docs/play-data-safety.md`.** You fill in the form; the sheet only saves you looking things up. **Answer: as recommended.** |
| **D13** | **Your Play developer account type.** New *personal* accounts need a closed test with 12 testers for 14 days before production access. Organisation accounts don't. | **M11's gate ends at "closed testing live + real-device check passed".** Getting testers and moving to production is part of your launch. Tell me which account type you have, so the Handoff states the timeline correctly. **Answer:** the gate scope stands. The account type was not given yet (the answer still had the template text); it goes into the Handoff once the owner gives it. |
