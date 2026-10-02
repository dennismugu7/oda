# Milestones

Each milestone is a vertical slice that ends **working, tested, committed and deployed to staging**. Don't start the next milestone until the acceptance criteria pass. Tick the boxes as you go.

Definition of done (every milestone):
- [ ] Lint, typecheck and all tests pass locally and in CI
- [ ] New logic has unit tests; new tables and endpoints have authorization tests; new buyer flows have Playwright tests
- [ ] Screens compared side by side with `design/` + `design-changes.md` (web: Playwright screenshot at 390×844; app: emulator screenshot)
- [ ] Web deployed to staging; app runs on an Android emulator/device via a dev build
- [ ] `docs/progress.md` updated (what was done, what deviated, open questions)

---

## M0 · Foundations
**Status: closed 2026-10-01** (gate passed; PR #1 merged as `e24fd42`, tag `m0-done`).
Monorepo + tooling + an empty but deployed skeleton.
- pnpm + Turborepo monorepo: `apps/web` (Next.js, App Router, TypeScript, Tailwind), `apps/seller` (Expo, TypeScript, Expo Router, Android only), `packages/shared` (types, zod schemas, pricing, order machine, phone/money utils), `packages/ui-tokens` (colours, type, radii, spacing extracted from `design/`), `packages/db` (Drizzle schema, migrations, seed).
- ESLint + Prettier, strict TypeScript, Vitest, Playwright, GitHub Actions CI (lint, typecheck, test).
- Local Postgres via Docker Compose (same major version as Neon). `.env.example` for every app. No secrets committed.
- Staging: Neon project `oda-staging`, R2 bucket `oda-staging`; web deployed (Vercel) at a staging URL with a `/api/health` route that checks the DB; EAS configured with dev and preview profiles.
- **Accept:** `pnpm dev` runs web + app locally; the web staging URL shows a placeholder page in the Poppins font and brand colours; the app opens on Android showing the welcome screen (static); CI is green.

## M1 · Database & security
- All tables, enums, indexes and triggers from `data-model.md` as Drizzle migrations.
- The authorization layer (`authz.ts`, scoped repositories) + automated authorization tests.
- `packages/shared`: order state machine, pricing, phone normalisation, M-Pesa code extraction, slug rules, with exhaustive unit tests.
- Seed: shop "Amani Styles" with categories, 13 products and orders in every status (matches the designs, except the product count and Accessories: decision #36).
- Staging migrations run **before** the Vercel deploy that needs them (fixes the migrate/deploy race in decision #27), e.g. Vercel deploys only after `migrate-staging` succeeds.
- `scripts/setup-android-windows.ps1`: one command that applies and verifies this machine's local Android build setup (ninja 1.12+ in the SDK's CMake 3.22.1, decision #28; the Gradle limits in `~/.gradle/gradle.properties`, decisions #23, #29, #30), safe to re-run, so an SDK reinstall can be repaired in one step.
- (Nightly backup moved to M2 with the R2 bucket, decision #31.)
- **Accept:** one command rebuilds the local DB from zero and seeds it; authorization tests prove seller isolation and anon lockout; state machine tests cover every transition in `order-lifecycle.md`; a migration merged to `main` is applied to Neon staging before the deployment that uses it goes live; re-running the Android setup script on this laptop reports everything in place, and repairs a deliberately reverted ninja.

## M2 · Seller auth & onboarding
Screens 01–14, email templates 04 and 06, web `/reset-password` (07, 08).
- Better Auth (email + password + 6-digit email OTP) in apps/web, Expo client integration, forgot/reset flow, session persistence, resumable onboarding, slug check, photo capture/upload with resizing, payment account setup.
- Resend configured on staging so emails actually arrive (sending domain: a subdomain of mugu-labs.com).
- R2 bucket `oda-staging` (decision #22) and the nightly backup GitHub Action (`pg_dump` of staging → private R2), moved here from M1 (decision #31).
- One EAS cloud build (`development` or `preview` profile) to prove the EAS fallback still works (decision #23).
- **Accept:** a backup file appears in R2; one EAS cloud build finishes and installs on the Redmi 15c. A new email can sign up, verify, finish onboarding and land on Home; the shop exists with 1 product; killing the app mid-onboarding resumes at the same step; reset password works end to end. The welcome screen matches the approved preview `design/app/welcome-animation/01-welcome-animation-preview.html` in a **side-by-side check on the Redmi 15c** (preview in the phone's browser next to the app): same card content (no badge, "Nairobi · Kilimani", three image tiles, tick on the "oda" baseline), the same five steps in the same order with matching timing and feel (~2.85 s, once, then still), no visible stutter; with Android's "Remove animations" on, the app shows the final state immediately, like the preview's "Remove animations" mode.

## M3 · Catalogue management (seller)
Screens 18-*, 19-shop-tab, 19b-categories, 20b-categories, 20b1-category-detail.
- Product CRUD, 1–5 photos with reorder, was-price, sizes/colours, status, soft delete; categories CRUD, visibility, drag reorder.
- **Accept:** all catalogue actions persist and reflect instantly; presigned upload authorization tests pass (can't upload into another shop's prefix, wrong type/size rejected).

## M4 · Buyer storefront
Web 01, 02, 03, 07 + shop states.
- Server-rendered shop/product pages, OG tags + OG images, search/filters/sort, cart (localStorage), favourites (localStorage), badges, visit counting with `?s=` source capture, slug redirects, paused/not-found/not-taking-orders states.
- Landing page `/`, `/privacy`, `/terms` (placeholder legal text clearly marked for later replacement).
- Seller app: 19b-preview (WebView of the real shop).
- **Accept:** pasting a shop link into WhatsApp shows a rich preview; Lighthouse mobile performance ≥ 85 on the shop home; a Playwright test covers browse → search → product → cart.

## M5 · Checkout & payment claim (buyer)
Web 4-checkout (changed), Pay page (redesigned 04b), 05, 6.
- Server checkout endpoint: validation, re-pricing, idempotency, rate limiting, honeypot, order number + token; pay page with code extraction; order page with the timeline, cancel, "payment not found" banner, report a problem; optional buyer emails.
- **Accept:** Playwright: full pay-now and pay-on-delivery orders; changing a price after add-to-cart is caught; order IDs cannot be guessed; the rate limit triggers.

## M6 · Order management (seller)
Screens 15, 16, 17-*, 17b-*, new mark-delivered, refund banner, notifications list.
- Home To-do + sales card, orders list/search, order detail with every action via server RPCs, WhatsApp prefill links, manual order creation, push notifications (Expo), in-app notifications, hourly auto-expire job.
- **Needs from you:** a **Firebase project** (free) with the Android app `com.mugulabs.oda` registered, for Expo push via FCM (its `google-services.json` and the FCM credentials uploaded to EAS/Expo).
- **Accept:** the lifecycle can be driven end to end by a buyer on web + a seller on the phone; push arrives on a real device within 10s of a web order; forbidden transitions are rejected by the server.

## M7 · Reviews
Web 05c, 5d; app 20b-reviews.
- Review submission (delivered only, one per order, 7-day edit), photos, rating aggregates (shop + product), seller replies, reviews on the product page.
- **Accept:** aggregates update correctly (tests), and a review cannot be posted on an undelivered order.

## M8 · Grow & manage
Screens 19b-share, 20-more, 20b-insights, 20b-customers, 20b-shop-profile, 20b-payments, 20b-delivery, 20b-settings, 20b-your-details, 20b-help, 21-*.
- Share tools (share images rendered on device, QR, EN/SW captions), insights (Nairobi timezone, sale definition per order-lifecycle.md), customers, profile (slug change + history), payments accounts, delivery areas/pickup/free delivery, settings (pause shop, delete account), help guides, feedback, in-app review.
- Account deletion: in-app flow, the web `/delete-account` request form, and the daily `/api/cron/purge` job with its scheduler.
- **Accept:** insights numbers match a SQL check on the seed data; pausing blocks new orders on the web; slug change keeps the old link working; a deleted shop 404s immediately and the purge job removes its data, photos and auth user after 30 days (tested with a backdated record).

## M9 · Admin back office
`/admin` in apps/web.
- Till verification queue, shops (suspend), reports, feedback, deletion requests, basic counts.
- **Accept:** a verified till shows the badge on the web; a suspended shop returns 404; non-admins get 404 on `/admin`.

## M10 · Hardening
- Security review (auth, authorization layer, endpoints, rate limits, secrets, dependency audit), all empty/error/offline states, accessibility pass, performance pass, Sentry wired in both apps, backup check, full end-to-end regression on staging with a real Android device.
- **Accept:** a written review report in `docs/hardening-report.md` with every issue fixed or consciously deferred.

## M11 · Launch
Production Neon + R2 + web on `oda.mugu-labs.com`, DNS + email domain records, production EAS build (AAB), Play Console listing, privacy policy URL, data safety form, closed testing track, then production. Guided step by step outside Claude Code where needed.
