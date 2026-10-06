# Design screens: index & required changes

The PNGs in `design/` are the **visual reference** (layout, spacing, colours, type, components, copy tone). Where this file says something different, **this file wins**. For screens marked NEW, build them in the same visual language as their neighbours.

## Global
- **Domain:** every `oda.shop/…` becomes the configured base, for example `oda.mugu-labs.com/…`. Slugs are hyphenated (`amani-styles`, never `amanistyles`).
- **Status bars / browser chrome** in the images are mockup decoration. Don't build them.
- **Automated WhatsApp:** wherever a screen says oda will WhatsApp someone ("We'll WhatsApp your rating link", "We'll send her the reason", "Wanjiku gets a WhatsApp message"), v1 behaviour is: after the action saves, open the **seller's** WhatsApp with a pre-written message. Reword the copy to "Message Wanjiku on WhatsApp" (seller app) or remove it (buyer web).
- **"Payment checked by oda"** (web 01, 02, 03, 04) is false under our payment model. Replace it with "Pay the seller directly on M-Pesa". **No "M-Pesa till checked by oda" badge anywhere** (decision #72: no till verification); M8 removes the existing badge and copy.
- **Brand name in UI text:** always lowercase **oda** (never "Oda"), including where an image capitalises it.
- **Till badge:** dropped (decision #72). Onboarding step 5 and 20b-payments don't mention verification.
- **Theme:** light only. Hide the Theme row in Settings.
- **Brand:** primary orange-red (~#D94A27), dark navy (~#1C1B2E), green accent (~#1F7A4D), warm cream/peach backgrounds. **Poppins everywhere** and **brand colours everywhere**: screens that show other fonts (02–08, including the button on 02) or off-brand colours (08's tick) are mockup inconsistencies. Extract exact tokens from the images into `packages/ui-tokens` in Milestone 0.

## Seller app (`design/app/`)

| File | Screen | Changes |
|---|---|---|
| 01-welcome | Welcome | Static in M0. **M2: new card content + animation, approved**: see "01-welcome: animated illustration (M2, approved)" below and the HTML preview in `design/app/welcome-animation/`. |
| 02-sign-up | Sign up | **Remove Google/Facebook buttons** and "or continue with". |
| 03-verify-email | Enter code | 6-digit code (Better Auth email OTP plugin). Add a 60s resend cooldown. |
| 04-email-verification-code | Email template (OTP) | This is an **email**, not an app screen. The code is **6 digits** (image shows 8). Build it as a React Email / HTML template sent via Resend from the Better Auth OTP hook. |
| 05-sign-in | Sign in | **Remove Google/Facebook buttons.** |
| 06-email-reset-password | Email template (reset) | Email template with a link to the web `/reset-password`. |
| 07-reset-password-page | Reset password | **Web page** at `/reset-password` (apps/web). Include the rules (8+ chars, a number). |
| 08-password-changed | Success | Web page after reset, plus an "Open oda app" button (deep link `oda://`). |
| 09–13 onboarding | Onboarding steps | Progress bar: 6 segments, filled = step number (the images are inconsistent). Steps 1–2 **Skip** sets `business_type = other`, `channels = []`. 11: the domain changes. The shop name preview "Chat" is the WhatsApp button. 13: the "Skip" copy becomes "Skip for now · buyers can only pay on delivery until you add this"; no line about a badge or verification (decision #72; M8 removes the current one). |
| 14-onboarding-shop-live | Shop is live | Checklist item "Send yourself a test message" → **"Test your WhatsApp link"**: opens `wa.me/<own number>` so they see what buyers see; ticks when tapped. No "checked" claim. The checklist follows the spec (**7 items**, "Add 4 more products"), not the image's "3 of 6" / "Add two more products"; 15 likewise. |
| 15-home-empty, 16-home-populated | Home | Bell opens **NEW Notifications** screen. "To confirm / To send / New" as in the spec. |
| 17-orders | Orders list | Group by lifecycle (see order-lifecycle.md). |
| 17-order-detail | Order detail | Stepper labels per order-lifecycle.md. The bottom action changes with status. "Payment isn't in my M-Pesa" → confirmation sheet → status back to awaiting payment + optional WhatsApp prefill to the buyer. Show a warning if the code was used on another order. |
| 17-new-order | Manual order | "We'll send order updates to this WhatsApp number" → "Buyer's WhatsApp number". Payment choices become three: *Already paid* / *Not paid yet* / *Pay on delivery*. After create: show the order link with Copy / Send on WhatsApp. |
| 17b-confirm-payment | Confirm sheet | The copy under the checkbox becomes "Message Wanjiku on WhatsApp after confirming" (toggle). |
| 17b-cancel-order | Cancel sheet | If payment is `paid`: the refund box shows and cancelling creates `refund_due`. If `claimed`: ask "Did you receive KES x in M-Pesa?" Yes/No first (see order-lifecycle.md). The toggle becomes "Message Wanjiku on WhatsApp". |
| 17b-mark-sent | Mark as sent | The toggle becomes "Message Wanjiku on WhatsApp" (prefill includes the rider phone + order link). |
| NEW: mark-delivered sheet | — | Like mark-sent: "Delivered?" + for pay-on-delivery "I've collected KSh x" checkbox + WhatsApp toggle (prefill includes the review link). |
| NEW: refund-due banner | — | On order detail when payment is `refund_due`: "Send KSh x back to 07xx… on M-Pesa" + **Mark refund sent**. |
| Bottom tabs (all tab screens) | Navigation | **Home · Orders · + · Shop · More** everywhere; the tab is "Shop" (not "Products"). |
| 18-products, 18-edit-product | Products | **18-products is merged into 19-shop-tab** (not built as its own screen). 18-edit-product stays: add an optional **"Was price"** field under Price. Colours use a preset palette + custom name. Add **Delete product** in the ⋮ menu. |
| 19-shop-tab, 19b-* | Shop, categories, preview, share | **19-shop-tab is the Shop tab:** shop header + product list + filters (one screen). Preview renders the real buyer web in a WebView (not a copy). The share caption is templated. **19b-categories is not built:** categories use 20b-categories. |
| 20-more, 20b-* | More section | 20b-categories (thumbnails + chevron → 20b1) is **the** categories screen, reached from both the Shop tab and More. 20b-payments: "Add another M-Pesa account" saves extra accounts; one is active (radio). 20b-your-details: the email field note becomes "Email can't be changed yet"; **drop the profile-photo button** (initials only, no avatar in the data model). 20b-reviews: text is per item; show each item's text under the review with its product chip. 20b-settings: hide Theme. **Seed data (decision #36):** the screens show the seed shop with 13 products, not 12: Accessories is visible with 1 product (Beaded earrings) and Bags holds Kiondo bag + Leather tote. Counts in 19-shop-tab / 20b-categories follow the data. |
| 20b-help | Help | Guides are bundled markdown. Support WhatsApp number from config. |
| 21-* | Change password, rate app, feedback | none (rate app uses Play in-app review). |
| NEW: notifications | Notifications list | Newest first, unread dot, tap → order/review, "Mark all read". |
| NEW: offline bar | — | Thin bar "You're offline · showing saved data". |
| NEW: delete account confirm | — | Type "DELETE" to confirm. Explains that orders/customers are removed after 30 days. |
| app-icon | Launcher icon | Adaptive icon: foreground = wordmark, background = orange. |

### 01-welcome: animated illustration (M2, approved)

**Exact reference:** `design/app/welcome-animation/01-welcome-animation-preview.html` (open it in a browser; it has Replay, Slow motion and "Remove animations"). It is the reference for **timing, feel and card content**; where this text and the preview differ, ask. Product images: `design/app/welcome-animation/` (originals) and `apps/seller/assets/welcome/` (used by the app), transparent PNGs.

**Card content (changes from design 01):**
- Remove the "M-Pesa till checked" badge. Under "Amani Styles" show **"Nairobi · Kilimani"** (small, muted).
- The 3 colour blocks become **product tiles** with soft tinted backgrounds, image centred at max 78% of the tile:
  - `#FBE3DA` fashion, `welcome-fashion.png`
  - `#FBF0D2` food, `welcome-food.png`
  - `#E2F1E8` accessories, `welcome-accessories.png`
- The green tick sits on the **same baseline as "oda"**, like a full stop: its bottom on the text baseline, a small gap after the "a", matching the app icon and the web wordmark's green dot. (In the M0 build it sits below the baseline.)

**Choreography** (plays once on mount, ~2.85 s total, then stays still; Reanimated on the UI thread):
1. **0–650 ms:** shop card from opacity 0, translateY 26, rotateX 14°, rotateZ −4°, scale 0.94 to rest, with a springy overshoot (equivalent to `cubic-bezier(.34,1.56,.64,1)`).
2. **700–1450 ms:** a finger-tap indicator (30 dp circle, navy at 28% opacity, 2 dp white border) fades in about 70 dp below-right of the food tile, glides to its centre, presses (scale 0.78) and fades out.
3. **1300–2000 ms:** the food tile presses (0.92), pops (1.06) with a warm yellow glow, and settles at 1. **1320–1920 ms:** an orange 2 dp ring expands from the tile (scale 1 → 1.6) and fades. Before 1320 ms the ring already sits on the food tile at 0.9 opacity (it fades in with the card), exactly as in the preview (owner, 2026-10-03).
4. **1550–2250 ms:** the "New order #1042" card enters from translate(30, 70), scale 0.9, opacity 0 with a gentle bounce (overshoot to −8 dp, then +3 dp, then rest).
5. **2250–2850 ms:** "Turn your posts into orders." fades in from translateY 14 (easing `cubic-bezier(.2,.8,.2,1)`).

**Rules:**
- If the system **Remove animations** / reduce-motion setting is on (Reanimated `useReducedMotion()`), show the **final state immediately**.
- Must stay smooth on the **Redmi 15c**: animate only `transform` and `opacity` on the UI thread (worklets); no layout animation, no JS-thread timers. The tile's glow is a pre-rendered warm-yellow layer behind the tile whose opacity/scale animate, not an animated shadow.
- The buttons are usable immediately; the animation never blocks or delays input.

## Buyer web (`design/web/`)

| File | Screen | Changes |
|---|---|---|
| 01-shop-home | Shop home | **Remove** the "Order in 3h 20m · arrives tomorrow" banner. Replace it with a small delivery line (for example "Delivery from KES 200 · Pickup in Kilimani") or nothing. "Only 3 left" badges → removed. Add a WhatsApp chat button in the header. Product cards: the **green tick** = already in the cart; **"+"** quick-adds only when the product has no sizes and no colours, otherwise it opens the product page (also on 07-search). |
| 02-product | Product | Remove "Only 3 left" and "Arrives tomorrow, Thu 1 Oct". Delivery card: "Delivery from KES 200 · Free over KES 5,000". Payment card: "Pay the seller directly on M-Pesa" (+ "or on delivery" if enabled). **Drop "Size guide".** "120 sold" → "{units_sold} sold", shown only when `units_sold` ≥ 5. |
| 03-cart | Cart | Remove "Only 3 left" / "In stock". The free-delivery banner shows only if a threshold is set, with a progress bar toward it. Delivery row: "Calculated at checkout". |
| 4-checkout-details | Checkout | Add section **2 Delivery** as a radio list (areas with fee + ETA, Pickup) + address field. **3 Payment**: radio *Pay now with M-Pesa* / *Pay on delivery* (per shop settings), no "Change" link. Button: "Place order · KES x". Footer: "No account needed · You pay the seller directly". |
| 04b-mpesa-waiting | → **Pay page (REDESIGN)** | Replace the STK "Check your phone" screen with: header "Pay KES 4,300 to Amani Styles", an instructions card for the account type with big copyable numbers (Till / Pochi number / Paybill + Account = the seller's fixed account number or the order number, per `account_ref_mode`), "You'll see {payment_accounts.account_name} before entering your PIN", a textarea "Paste your M-Pesa message or the code" with live code extraction (show the extracted `SJK4X7PQ2M`), primary **I've paid**, secondary **Pay on delivery instead** (only if enabled), tertiary **Cancel order**. Keep the numbered-steps visual style of 04b. |
| 05-confirmation-v3 | Order placed | Pay-now: this shows **after** "I've paid", with the step "Waiting for Amani Styles to confirm your payment". Remove the "✓ Paid" chip until confirmed. Replace "We'll WhatsApp your rating link" with "Bookmark this page. It's how you track your order and leave a review". |
| 6-order-status | Order status | **Remove the 0:47 countdown.** The cancel card reads "Changed your mind? You can cancel until Amani Styles confirms." If payment was claimed: "Amani Styles will send your money back on M-Pesa". Steps per order-lifecycle.md. Pickup orders: step 3 reads **"Ready for pickup"** (same on the seller app). |
| 05c-order-page-delivered | Delivered | none (the slider button can be a normal button). |
| 5d-rate-order | Review | URL `/o/{token}/review`. Photo upload optional, 1 per item. |
| 07-search | Search | Remove "Only 2 in M". The filters sheet (NEW): category, size, max price. |
| NEW: states | — | Shop paused, shop not found, product not found, empty cart, order cancelled/expired, "payment not found" banner, generic error, offline. |
| NEW: legal pages | — | `/privacy`, `/terms`, `/delete-account` (form). Simple, readable. |
| NEW: landing `/` | — | Minimal oda page: what it is + "Get the app" (Play link later). |
