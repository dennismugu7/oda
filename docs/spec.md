# oda — Product Spec (v1)

> Source of truth for *what* we are building. If code and this doc disagree, stop and ask.
> Related: `order-lifecycle.md`, `data-model.md`, `design-changes.md`, `milestones.md`, `decisions.md`.

## 1. What oda is

oda gives social sellers in Kenya a free shop link. A seller sets up a shop in the **oda seller app (Android)**, then posts the link on WhatsApp, TikTok, Instagram and Facebook. Buyers tap the link, which opens the **oda shop (mobile web)**. There they browse, order, pay the seller directly on M-Pesa, track the order and leave a review.

**oda never holds money.** Buyers pay straight into the seller's own M-Pesa (Buy Goods Till, Pochi la Biashara or Paybill). The seller confirms each payment in the app. oda is free (no fees, no commission) in v1.

## 2. Users

| User | Where | Account |
|---|---|---|
| **Seller** | Android app (`apps/seller`) | Email + password, verified with a 6-digit email code (Better Auth) |
| **Buyer** | Mobile web (`apps/web`) | None. Guest checkout with name and phone. Order access via a secret link. |
| **oda admin** | Web back office (`apps/web` → `/admin`) | Email + password, `is_admin` flag |

## 3. Market rules (apply everywhere)

- Country: Kenya only. Currency **KES**, stored as **integer shillings** (no cents). Display: `KSh 2,500` in the seller app and `KES 2,500` in the buyer web (as in the designs).
- Phone numbers: stored in E.164 (`+2547XXXXXXXX` / `+2541XXXXXXXX`). Input accepts `07…`, `01…`, `7…`, `+254…`.
- Timezone for all "today / this week / this month" logic: **Africa/Nairobi**.
- Languages: UI in English. The share captions are the only bilingual feature (EN/SW).
- Android only for the seller app. The buyer web must work well on low-end Android Chrome with slow 3G.

## 4. Shop link

- Format: `https://oda.mugu-labs.com/{shop-slug}` (for example `oda.mugu-labs.com/amani-styles`).
- The base domain is **one config value** (`PUBLIC_SHOP_BASE_URL`). The designs show `oda.shop/…`, so render the configured domain instead.
- Slugs are lowercase, `a-z0-9-`, 3–30 characters, unique, and not on the reserved list (`admin, api, o, r, app, www, help, terms, privacy, delete-account, reset-password, login, static, assets, oda`).
- A slug is generated from the shop name and can be edited. **Changing a slug keeps the old one redirecting (301) forever** (table `shop_slug_history`).
- A slug that was ever used (in `shop_slug_history`) can never be taken by another shop.
- Shared links carry a source tag: `?s=wa|status|tt|ig|fb|qr|other`. It is used for "via TikTok" on orders and in Insights.
- Shop and product pages must render **Open Graph tags** (title, price, cover image) so WhatsApp, TikTok and Instagram show a rich preview.

## 5. Seller app — features

Screens are in `design/app/`. Deviations from the designs are listed in `design-changes.md` and **take priority over the images**.

### 5.1 Auth (screens 01–08)
- Implementation: **Better Auth** inside `apps/web` (email + password, the **email OTP plugin** with 6-digit codes and ~10 min expiry for sign-up verification, password reset by emailed link), with Better Auth's Expo integration in the seller app (session token in SecureStore). Emails are sent with Resend using the designs in screens 04 and 06. Sign-in and code attempts are rate-limited.
- Welcome → Sign in / Create new shop.
- Sign up: email + password (min 8 chars, must include a number). A 6-digit code is sent to the email → verify screen (resend with a 60s cooldown; "check spam" hint).
- Sign in: email + password. Forgot password → email with a reset link → web page `/reset-password` (screens 07, 08) → back to the app.
- **No Google or Facebook sign-in in v1.**
- Change password (screen 21) with an optional "log out other phones".
- Sessions persist. The access token refreshes silently.

### 5.2 Onboarding (screens 09–14)
Six steps, resumable if the app is closed. The progress bar shows the step. Answers to steps 1–2 are kept in `profiles.onboarding_draft`; the `shops` row is created at step 3, when the name and slug exist.
1. **What do you sell?** Sets `shops.business_type`, which presets suggested categories and size options for the first product.
2. **Where do you sell today?** Multi-select. Sets `shops.channels`, which orders the share buttons.
3. **Name your shop:** shop name → live slug check ("oda.mugu-labs.com/amani-styles is yours", Edit). WhatsApp number (required; this is the number buyers chat with). Logo optional (tap the avatar in the preview).
4. **Add your first product:** cover photo (camera or gallery) plus up to 4 more, name, price, sizes (optional).
5. **Where buyers pay you:** Buy Goods Till / Pochi la Biashara / Paybill. Number, the name on the account, and for Paybill the account reference: either a fixed account number (e.g. a bank paybill) or "use the order number". Saving sets verification to `pending` (admin queue). "Skip for now" is allowed: the screen tells the seller that buyers will pay on delivery until they add M-Pesa, and skipping turns on `accepts_pay_on_delivery`.
   - **Pay-now is available only if** `accepts_pay_before` is on **and** an active payment account exists. If neither pay-now nor pay-on-delivery is available, the shop shows "Not taking orders yet" (browse only).
6. **Your shop is live:** the link with Copy, share buttons, a ready-made post (EN/SW, "Try another"), and the "Finish your shop" checklist.

### 5.3 Home (screens 15, 16)
- Greeting, shop link (copy, preview, share).
- **To do** card: tabs *To confirm* (payment claimed) / *To send* (confirmed) / *New* (awaiting payment or acceptance), with counts and a quick "Confirm" action.
- Sales this week (bar chart Mon–Sun, % vs last week) and a top-source insight line.
- **Finish your shop** checklist: shop + first product + payment set · share link · add logo · add 4 more products · add more ways buyers reach you (TikTok/Instagram handle) · set delivery areas · test your WhatsApp link. Items without their own data (share link, test WhatsApp) are stored in `shops.checklist`. Hidden when complete.
- Empty state (screen 15) when there are no orders yet.
- Bell → Notifications list (new screen, see `design-changes.md`).

### 5.4 Orders (screens 17-*)
- List with tabs To do / All / Done. To do is grouped as *Confirm payment*, *New · to accept*, *New · awaiting payment*, *To send* (see `order-lifecycle.md`). Search by buyer name, phone or order number.
- Order detail: stepper (see `order-lifecycle.md`), source ("via TikTok"), buyer card (call, WhatsApp), items, delivery method and address, totals, payment account used, and the action for the current state.
- Actions: **Confirm payment** (sheet with a checkbox "amount and code match my M-Pesa message"), **Payment isn't in my M-Pesa**, **Accept order** (pay on delivery), **Mark as sent** (rider / parcel / pickup, optional rider phone), **Mark as delivered**, **Cancel** (reason chips; refund reminder if already paid), **Mark refund sent**.
- Every "Tell {buyer} on WhatsApp" toggle opens the **seller's own WhatsApp** with a pre-written message (`wa.me/<buyer>?text=…`) after the action is saved. oda does not send WhatsApp messages itself in v1.
- **New order** (manual, for DMs/calls/in person): buyer name + phone, items from the catalogue (size/colour/qty), delivery fee (editable override), payment: *Already paid* / *Not paid yet* / *Pay on delivery*. It creates a normal order with `source = manual` and produces an order link the seller can send.

### 5.5 Products (screens 18-*, 12)
- List with category filter chips and counts, search, sort (newest first default). Rows show sizes, sold count, "Add photo" and "Sold out" badges.
- Add/Edit: photos (1–5, first = cover, drag to reorder), name, price, **was-price (optional)**, category, description (optional), sizes (chips + custom), colours (preset palette + custom name), status Available / Sold out / Hidden. Delete product (soft delete; past orders keep their snapshot).
- Photos are resized on device before upload into two files: full (max 1600px, JPEG ~80%) and thumbnail (~400px).

### 5.6 Shop tab & categories (screens 19-*, 20b-categories, 20b1)
- Shop header with View (in-app preview, screen 19b-preview) and Share.
- Categories: add, rename, show/hide, drag to reorder, assign products. **Empty categories are never shown to buyers.**
- Share your shop (19b-share): channel tabs, image choice (**New in** = latest product card, **Collection** = shop card, **QR code**), caption EN/SW with "Try another" (template-based, no AI), Copy caption, Copy link, and "Share to {channel}" via the Android share sheet. The link includes the channel's `?s=` tag.

### 5.7 More (screen 20-more)
- **Insights:** Today / This week / This month. Sales total, % vs the previous period, bar chart, orders, average order, shop visits, orders by source, top products.
- **Customers:** derived from orders and grouped by phone. Total spent, order count, last order, a "Repeat" badge (≥2 orders). Filters All / Repeat / New this month. WhatsApp button.
- **Reviews:** average and distribution, tabs All / Needs reply / Low ratings (≤3★). Reply (one reply per review, editable).
- **Shop profile:** logo, name, link (change link, with a warning that old links keep working), about, location (Kenyan town / Nairobi area picker + free text), how buyers reach you: WhatsApp (main button), phone calls toggle, TikTok and Instagram handles.
- **Payments:** M-Pesa accounts (one is *active* and shown at checkout; others saved), "When buyers pay" toggles *Before delivery* / *On delivery* (at least one must be on), and "oda never touches your money".
- **Delivery:** areas (name, fee, method rider/parcel, ETA text such as "Same day"), pickup toggle (location + hours text), free delivery over an amount (applies only to areas flagged `free_delivery_eligible`).
- **Settings:** your details, change password, **pause shop**, share feedback, rate the app (Play in-app review), terms & privacy (open web pages), log out, **delete account** (the shop 404s immediately and the seller is signed out; all shop data, photos and the auth user are purged after 30 days by `/api/cron/purge`). (Theme selector hidden: light only in v1.)
- **Help & support:** searchable static guides (markdown bundled in the app), Chat with oda support (`wa.me/<ODA_SUPPORT_WHATSAPP>`), Report a problem, Suggest an idea → `feedback` table.

### 5.8 Push notifications
Via Expo push (FCM). Triggers: exactly the `notifications.type` enum: new order, buyer says they paid, buyer switched to pay on delivery, buyer cancelled, order auto-expired, new review. Tapping one opens the relevant order or review. They also appear in the in-app Notifications list.

## 6. Buyer web — features

Screens are in `design/web/`. The iPhone status bar and URL bar in the images are mock chrome; ignore them.

### 6.0 Routes
| Route | Page |
|---|---|
| `/` | Landing page |
| `/{slug}` | Shop home (`?c={categoryId}` filters by category) |
| `/{slug}/search` | Search + filters |
| `/{slug}/p/{productId}` | Product |
| `/{slug}/cart` | Cart |
| `/{slug}/checkout` | Checkout |
| `/o/{token}` | Order: the pay page while `awaiting_payment` (pay now), otherwise the order status page |
| `/o/{token}/review` | Review |
| `/privacy`, `/terms`, `/delete-account`, `/reset-password` | Legal + account pages |
| `/admin/...` | Back office |
| `/api/...` | Server API |

### 6.1 Shop home (01) & search (07)
- Header: logo/initials, name, rating + delivered count + location, share button (Web Share API, fallback copy).
- "M-Pesa till checked by oda" badge only when an admin has verified the till.
- Search box → search page (07): text search on name/description, filter chips (category, size, max price), sort Popular / Newest / Price.
- Category chips (only non-empty, visible categories, in seller order).
- Product grid: cover, name, rating, price, was-price, badges (**Bestseller** = top 3 by units sold with ≥3 sold; **New** = created in the last 14 days; **Sold out**). No stock-count badges.
- Favourites (heart) are saved **on this device only** (localStorage).
- Sticky cart bar when the cart is not empty.
- Seller WhatsApp "Chat" button (as in the seller's preview, 19b-preview).
- States: shop paused ("taking a break, back soon", can browse, cannot order), shop not found (404 with oda branding), shop suspended by admin (same as not found).

### 6.2 Product (02)
Photo carousel with a count, favourite, cart icon with count, badge, name, rating (links to reviews), price/was-price/"Save x%", colour swatches, size buttons (the sizes the seller listed), qty stepper, and **Add to cart · KES x**. Delivery info card (cheapest area fee, pickup, free-delivery threshold). Payment info card: "Pay the seller directly with M-Pesa" / "or on delivery" according to settings. Product reviews list below.

### 6.3 Cart (03)
Per shop, stored in localStorage. Line items (size/colour, qty, remove), a free-delivery progress banner (if the seller has a threshold), "Goes well with" (up to 2 visible products from other categories, by popularity), subtotal. Delivery is shown as "Choose at checkout". **Prices are re-validated by the server at checkout.** If an item became sold out, hidden or changed price, show it inline and block checkout until resolved.

### 6.4 Checkout (4-checkout-details, changed)
1. **Your details:** name, phone (+254), "I use WhatsApp on this number" (default on), optional email for a receipt, privacy note.
2. **Delivery:** radio list of the seller's delivery areas (fee + ETA) and Pickup (if enabled). Address/directions text (required for delivery). Free delivery is applied automatically when eligible.
3. **Payment:** *Pay now with M-Pesa* and/or *Pay on delivery*, according to shop settings. Pay now is only available if the shop has an active payment account.
4. Button: **Place order · KES x**. Server-side: validate, recompute totals, rate-limit, create the order, return the order token → redirect to `/o/{token}`.

### 6.5 Pay page (replaces 04b, see `design-changes.md`)
For pay-now orders in `awaiting_payment`: shows **exact** M-Pesa instructions for the seller's account type (Till: "Lipa na M-Pesa → Buy Goods → Till 123 456 → KES 4,300"; Pochi; Paybill + account number = order number). Copy buttons. The seller's name on the account ("confirm you see AMANI STYLES before entering your PIN"). A field **"Paste your M-Pesa confirmation message or code"** that extracts the 10-character code → **I've paid**. After submitting: "Waiting for {shop} to confirm your payment". Pay-on-delivery orders skip this page.

### 6.6 Order page `/o/{token}` (05-confirmation, 6-order-status, 05c-delivered)
- Just placed: "Order placed!" + what happens next + the tracking/bookmark note.
- Status timeline matching `order-lifecycle.md`, with timestamps.
- Cancel button while the order is cancellable. If the buyer already claimed payment, the copy says the seller will refund to M-Pesa manually. **No countdown timer.**
- If the seller reported "payment not found": a banner prompting the buyer to re-check and resubmit the code, or message the seller.
- Sent: method + rider phone if given.
- Delivered: "Rate your order" card (05c).
- Help: Message {shop} (wa.me with the order number prefilled), Report a problem to oda (form → `reports`).
- Cancelled / expired states.

### 6.7 Review `/o/{token}/review` (5d)
Only when the order is delivered, one review per order (editable for 7 days). Overall stars (required), tags (As described, Well packed, Fast delivery, Friendly seller), per-item stars + optional text + optional 1 photo per item. Shown publicly as "Wanjiku K. · Verified buyer".

### 6.8 Buyer emails (only if the buyer gave an email)
Exactly the "email" side effects listed in `order-lifecycle.md`. Every email includes the order link.

## 7. Admin back office (`/admin`, desktop web, plain UI)
- **Till verification queue:** seller, account type, number, name. The admin checks the registered name in M-Pesa and marks Verified or Rejected (with a note). Verified → the "M-Pesa till checked" badge.
- **Shops:** search, view, suspend/unsuspend (suspended = the public page returns 404).
- **Reports** from buyers and **feedback** from sellers: list, status (new / in progress / closed), notes.
- **Account deletion requests** from the web form.
- Basic counts: shops created, live shops (≥1 product), orders per day.

## 8. Non-functional requirements
- **Security:** the database is reachable only from the server. Every request goes through the authorization layer described in `data-model.md` (seller scoping, order tokens, admin checks), with automated tests. Buyer actions go through server endpoints with zod validation and rate limits. Order links use a random 12-character token (unguessable). The order number (#1042) is only a display label, sequential **per shop**.
- **Abuse:** rate-limit order creation (per IP and per phone), honeypot field, max 20 open unpaid orders per phone per shop. Flag an M-Pesa code already used on another order in the same shop ("This code was used on order #1031").
- **Performance:** shop home < 2.5s LCP on mid-range Android over 4G. Grids use the ~400px thumbnails; detail pages use the full image. No paid image-transformation service.
- **Reliability:** order creation is idempotent (client-generated idempotency key). All money maths is in one shared function and unit-tested.
- **Observability:** Sentry in the web and the app. Structured server logs.
- **Privacy:** buyer data is visible only to that shop's seller and to admins. Privacy policy + terms pages. Account deletion in-app and via the web form (a Google Play requirement). Kenya Data Protection Act: collect the minimum and allow deletion on request.
- **Accessibility:** tap targets ≥ 44px, contrast AA, labels on inputs.
- **Offline (seller app):** show cached data read-only with a clear "You're offline" bar. Queue nothing in v1.

## 9. Out of scope for v1
Payment aggregator / STK push / automatic payment confirmation · deposits · automated WhatsApp/SMS messages · courier integrations · stock counts · buyer accounts · iOS app · multiple staff per shop · multiple shops per seller · dark mode · discount codes · AI captions · Google/Facebook sign-in · commissions/subscriptions.
