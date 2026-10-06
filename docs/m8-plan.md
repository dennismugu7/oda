# M8 plan: grow & manage (proposed, not approved)

Proposed in owner Step 81. **Not approved yet; no M8 work started.** Acceptance criteria stay in `milestones.md` (M8). M8 is large, so it's split in two (like M2): **M8a · Settings, accounts and operations** first (Play requires account deletion, and the M9 jobs live here), then **M8b · Grow** (More, Insights, Customers, Share, Help, Rate the app). Each part has its own branch, checkpoints, review stops, gate and tag (`m8a-done`, then `m8-done`).

**Native build: none expected.** Everything M8 needs on the phone is already in build 0.3.0: image picker + manipulator (logo, feedback screenshot), view-shot + SVG (share images, QR), sharing, clipboard, store review (rate the app), web browser (terms/privacy), WebView. All of M8 ships as EAS Updates. One small **JavaScript** package is needed for QR codes (M8b, below).

---

## M8a · Settings, accounts and operations

Screens: **20b-settings, 20b-your-details, 21-change-password, 20b-shop-profile, 20b-payments, 21-share-feedback**, the delete-account confirm (design-changes NEW), web **`/delete-account`** (NEW), plus the badge removal everywhere.

**CP1 · Drop the till badge + settings server** (decision #72 a)
- Remove "M-Pesa till checked by oda" and every verification line: shop page, product page (today `mpesaChecked`), checkout, pay page, onboarding step 5 copy (design-changes), the app. `payment_accounts.verification_*` stays unused (no migration). A Playwright check that no page shows it.
- APIs (seller session, zod whitelists, authorization tests):
  - `GET/PATCH /api/me/details` (first/last name, recovery phone; email read-only, "Email can't be changed yet").
  - Change password through Better Auth (current + new; other sessions signed out; the email "your password changed").
  - `GET/PATCH /api/shop/profile`: name, logo (signed upload, existing checks), about, location (town / Nairobi area picker + free text), WhatsApp, calls toggle, TikTok/Instagram. **Link change** with the existing slug rules: the old link goes into `shop_slug_history` and keeps redirecting (already built in M4); the app warns first.
  - `GET /api/payments`, add an account, make one active, remove a non-active one; **"When buyers pay"** toggles before / on delivery (at least one on: the `shops_payment_option` constraint). This also fixes the carried-forward item "a shop that entered a Till can't turn pay on delivery on".
  - `PATCH /api/shop/pause` (pause / resume: paused = browse only, no new orders; already enforced by checkout).
  - `POST /api/feedback` (kind idea / broken / confusing / love / problem, message, optional screenshot, "reply on WhatsApp"), 5 a day per shop.
- Tests: each endpoint's whitelist + authorization (another shop 404, signed out 401), slug change + old link redirect, payments rules, pause blocks web orders (server + Playwright).

**CP2 · Settings screens (app)**
- **More** gets "Shop profile", "Payments", "Settings" rows (the full 20-more redesign is M8b).
- 20b-settings: your details, change password, **pause shop** (toggle with a confirm), share feedback, terms & privacy (open the web pages), log out, **delete account**. Rate the app → M8b. Theme hidden.
- 20b-your-details, 21-change-password, 20b-shop-profile (logo, name, link with the warning, about, location, contacts), 20b-payments (accounts with the active radio, add account, the two toggles, "oda never touches your money"), 21-share-feedback (kind chips, message, add screenshot, reply on WhatsApp).
- Every screen: loading, empty, error, offline (read-only) states.
- → 🛑 **Review stop A** (phone: settings, profile, link change, payments, pause, feedback; badge gone on the web).

**CP3 · Account deletion, the purge job, the support digest**
- **In-app deletion** (type "DELETE"): the shop gets `deleted_at` (its page 404s at once, open buyer order links show "This shop has closed", #38 c), the profile gets `deleted_at`, every session is signed out, push tokens are removed. The purge does the rest after 30 days.
- **Web `/delete-account`** (decision #72 c): enter the account email → the same answer whether or not the email has an account ("If this email has an oda account, we've sent a link") → an email with a confirm link (token in the URL fragment `#token=`, #45; stored only as a hash; single use, 1 hour) → the confirm page says what happens and has one button → the same deletion as in the app. Rate limits per IP and per email. Playwright + server tests.
- **`/api/cron/purge`** (daily, Bearer `CRON_SECRET`, GitHub Actions `cron-purge.yml` + manual run), in batches, each step idempotent and logged by counts only:
  1. **Deleted shops older than 30 days:** delete their storage objects (`products/`, `logos/`, `feedback/`, and `reviews/{orderId}/` for their orders), then the shop row (orders, reviews, notifications cascade), the profile and the Better Auth user + sessions. Buyer order links then 404 (#38 c).
  2. **`signup_attempts` older than 7 days.**
  3. **`storage_deletions` left over** (failed deletes): retry, keep the row on failure.
  4. **Unreferenced photos:** objects under `products/`, `logos/`, `reviews/` older than 24 h that no row points at (abandoned uploads, review photos never submitted). Needs a `list(prefix)` in the storage interface (Vercel Blob `list()`, S3 `ListObjectsV2`, local readdir). Keys still used as an order item's `cover_path_snapshot` count as referenced.
  5. **Soft-deleted products** (owner decision, question 2 below).
- **Daily support digest** `/api/cron/digest` (08:00 Nairobi, `cron-digest.yml` + manual): one email to `support@mugu-labs.com` via Resend **only when something is new**: buyer reports (order number, shop, message, contact phone), seller feedback (shop, kind, message, reply-on-WhatsApp, a short-lived signed link to the screenshot), **reported reviews** (shop, order number, stars, text, report reason; "remove with Actions → review-remove", decision #73 a). Each item is marked sent in the same run so nothing is mailed twice or skipped. Logs: counts only (#45).
- **Staging test tools:** `staging-backdate-deletion.yml` (makes one deleted test shop look 31 days old), like `staging-backdate-order.yml`.
- Tests: purge with backdated records (data, photos, auth user gone; a shop deleted 29 days ago untouched; a live shop's photos never touched), digest once per item and silent on a quiet day, deletion link single use / expired / wrong token, both deletion paths 404 the shop at once.
- → 🛑 **Review stop B** (phone: delete a throwaway shop in the app and one from the web; backdate + run the purge; digest email).
- **Gate → `m8a-done`.**

### Schema changes (M8a, expand only, one migration; recorded as a decision first)
- `reports.notified_at`, `feedback.notified_at` (planned in #72 b) and **`reviews.report_notified_at`** (new: the digest's mark for reported reviews).
- `deletion_requests`: `token_hash`, `expires_at`, `confirmed_at` (planned in #72 c).
- Nothing else; the purge uses existing columns.

### Phone test plan, M8a (draft)
**Review stop A**
1. On the shop page, product page, checkout and pay page (web), and onboarding step 5 / Payments (app): no "M-Pesa till checked" anywhere.
2. More → Settings → Your details: change your first name → saved; the email shows "Email can't be changed yet".
3. Change password (wrong current password → clear error; then a real change) → you stay signed in; signing in again needs the new password; an email says it changed.
4. Shop profile: change the logo, about, location, TikTok handle → the web shop shows them.
5. Change the shop link → warning first → saved; the **old link still opens** the shop (redirect); shared links use the new one.
6. Payments: add a second M-Pesa account, make it active → checkout shows it; turn "On delivery" on and "Before delivery" off → checkout offers only pay on delivery; trying to turn both off is refused with a message.
7. Pause shop → the web shop shows "taking a break" and refuses orders; resume → orders work again.
8. Share feedback with a screenshot → "Thanks" (arrives in the digest at review stop B).

**Review stop B**
9. With a **throwaway** account: Settings → Delete account → type DELETE → signed out; the shop link 404s at once; an old order link shows "This shop has closed".
10. Web `/delete-account` with a second throwaway account's email → the email arrives → the link opens the confirm page → confirm → that shop 404s; opening the link again says it's used.
11. Actions → staging-backdate-deletion (the step 9 shop) → Actions → cron-purge → its products, photos and account are gone (the summary shows counts); your own shop untouched.
12. Actions → cron-digest → `support@mugu-labs.com` gets one email with the feedback from step 8 (and any reports / reported reviews); running it again sends nothing.

---

## M8b · Grow

Screens: **20-more** (full), **20b-insights, 20b-customers, 19b-share, 20b-help, 21-rate-app**.

**CP1 · Insights + customers server**
- `GET /api/insights?period=today|week|month`: Nairobi buckets (today by hour, week Mon–Sun, month by day), **sales = confirmed / sent / delivered** (order-lifecycle.md), total and % vs the previous period (same stretch), bar chart, orders, average order, shop visits (`shop_visits_daily`), orders by source, top products. A test compares every number with a SQL check on the seed data (the milestone's acceptance).
- `GET /api/customers?filter=all|repeat|new`: grouped by phone, total spent / order count / repeat (≥ 2 sales) from sales only, last order, WhatsApp link; pages.
- `GET /api/more`: the row values for 20-more (this week's sales, customers, rating, active till, delivery areas, categories).

**CP2 · App: More, Insights, Customers**
- **20-more** as designed: shop card (logo, name, link, **View**), Your business (Insights "KSh x this week", Customers n, Reviews 4.8 ★ · 38), Your shop (Shop profile, Payments "Till 123 456", Delivery "3 areas", Categories n), Settings, Help and support. Fixes the carried-forward item "the Shop tab's card shows the initial, not the logo" (`/api/me` gets the logo URL).
- 20b-insights (period tabs, chart, cards, sources, top products), 20b-customers (filters, rows, Repeat badge, WhatsApp).
- → 🛑 **Review stop A** (phone: numbers match orders you placed; customers grouping).

**CP3 · Share, Help, Rate the app**
- **19b-share:** channel tabs (WhatsApp, Status, TikTok, Instagram, Facebook; the brand rules from #55/#56, TikTok neutral), images rendered on the phone with view-shot: **New in** (latest product card), **Collection** (shop card), **QR code** (the shop link); EN/SW captions with "Try another" (templates, no AI; reuses the onboarding post); Copy caption, Copy link, Share to {channel} through the share sheet; every link tagged `?s=`. "My status" from the Status button: checked on the phone (carried forward).
- **20b-help:** searchable guides bundled as Markdown in the app (I write first drafts in plain English for you to review: getting paid, delivery, orders, reviews, sharing, account), **Chat with oda support** (`wa.me/<ODA_SUPPORT_WHATSAPP>` from config), Report a problem / Suggest an idea → the feedback screen.
- **21-rate-app:** Play in-app review (`expo-store-review`). On the sideloaded preview APK Play shows nothing, so the screen falls back to opening the Play listing once it exists (M11); tested for "no crash, sensible message".
- → 🛑 **Review stop B** (phone: share images and QR, captions, help search, support chat).
- **Gate → `m8-done`.**

### Schema changes (M8b)
- None planned.

### Phone test plan, M8b (draft)
**Review stop A**
1. More shows your logo, link and View; the row values match (this week's sales, customers, rating, till, areas, categories).
2. Insights → Today / This week / This month: sales, orders, average order and the % match the orders you placed (sales only: confirmed, sent, delivered); visits count your own visits from another phone; sources match the `?s=` links used.
3. Customers: the same phone across two orders is one customer with "Repeat"; New this month and Repeat filters; WhatsApp opens the chat.

**Review stop B**
4. Share → WhatsApp tab → New in → the image shows your latest product; Share → WhatsApp opens with the image and caption; the link ends with `?s=wa`.
5. Collection and QR images; scanning the QR with another phone opens your shop.
6. EN/SW captions and "Try another"; Copy caption / Copy link.
7. Help: search "refund" finds the guide; Chat with oda support opens WhatsApp to the support number.
8. Rate the app: no crash; a clear message on the test build.

---

## Questions for the owner
1. **Feedback screenshots need private storage.** Decision #72 b sends them as short-lived signed links, so they must not sit in the public image store. Options: (a) you create a second, **private** Vercel Blob store for staging (e.g. `oda-staging-private`) and connect it to the web project. That takes a few clicks on the dashboard; I'd tell you exactly which. (b) No screenshots until R2 in M11. **I suggest (a).**
2. **Soft-deleted products:** (a) keep them forever (rows and photos stay; simplest); (b) **purge them 30 days after deletion**: delete the row (order items keep their name and price snapshot; `order_items.product_id` becomes null, as the schema already allows) and its photos, except a thumbnail still shown on a past order. **I suggest (b).** It keeps storage within the free limits, and past orders still look right.
3. **Support WhatsApp number** for Help (`ODA_SUPPORT_WHATSAPP`): which number (M8b)? It goes in Vercel/EAS config, not in the repo.
4. **Digest time:** 08:00 Nairobi every day, or another time?
5. **Help guides:** fine for me to write the first drafts (plain English, short) for you to review at M8b review stop B?

## What I need from you
- Approval of the split and the plan, and answers to the five questions.
- M8a: if you choose 1 (a), the private Blob store (I'll send the exact steps). Nothing else external: Resend, cron secrets and storage exist.
- M8b: the support WhatsApp number; approval of one small npm package for QR codes (`qrcode`, about 100 KB, pure JavaScript, rendered with the existing `react-native-svg`), installed when M8b starts.
- No native build, no paid service.
