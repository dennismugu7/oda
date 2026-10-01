# Design screens: index & required changes

The PNGs in `design/` are the **visual reference** (layout, spacing, colours, type, components, copy tone). Where this file says something different, **this file wins**. For screens marked NEW, build them in the same visual language as their neighbours.

## Global
- **Domain:** every `oda.shop/…` becomes the configured base, for example `oda.mugu-labs.com/…`. Slugs are hyphenated (`amani-styles`, never `amanistyles`).
- **Status bars / browser chrome** in the images are mockup decoration. Don't build them.
- **Automated WhatsApp:** wherever a screen says oda will WhatsApp someone ("We'll WhatsApp your rating link", "We'll send her the reason", "Wanjiku gets a WhatsApp message"), v1 behaviour is: after the action saves, open the **seller's** WhatsApp with a pre-written message. Reword the copy to "Message Wanjiku on WhatsApp" (seller app) or remove it (buyer web).
- **"Payment checked by oda"** (web 01, 02, 03, 04) is false under our payment model. Replace it with "Pay the seller directly on M-Pesa". Show the "M-Pesa till checked by oda" badge only when the till is verified.
- **Brand name in UI text:** always lowercase **oda** (never "Oda"), including where an image capitalises it.
- **Till badge wording:** always **"M-Pesa till checked by oda"** (app, web, onboarding copy).
- **Theme:** light only. Hide the Theme row in Settings.
- **Brand:** primary orange-red (~#D94A27), dark navy (~#1C1B2E), green accent (~#1F7A4D), warm cream/peach backgrounds. **Poppins everywhere** and **brand colours everywhere**: screens that show other fonts (02–08, including the button on 02) or off-brand colours (08's tick) are mockup inconsistencies. Extract exact tokens from the images into `packages/ui-tokens` in Milestone 0.

## Seller app (`design/app/`)

| File | Screen | Changes |
|---|---|---|
| 01-welcome | Welcome | Matches the image (static, M0). **M2: animate the illustration once on open**: see "01-welcome: animated illustration (M2)" below. |
| 02-sign-up | Sign up | **Remove Google/Facebook buttons** and "or continue with". |
| 03-verify-email | Enter code | 6-digit code (Better Auth email OTP plugin). Add a 60s resend cooldown. |
| 04-email-verification-code | Email template (OTP) | This is an **email**, not an app screen. The code is **6 digits** (image shows 8). Build it as a React Email / HTML template sent via Resend from the Better Auth OTP hook. |
| 05-sign-in | Sign in | **Remove Google/Facebook buttons.** |
| 06-email-reset-password | Email template (reset) | Email template with a link to the web `/reset-password`. |
| 07-reset-password-page | Reset password | **Web page** at `/reset-password` (apps/web). Include the rules (8+ chars, a number). |
| 08-password-changed | Success | Web page after reset, plus an "Open oda app" button (deep link `oda://`). |
| 09–13 onboarding | Onboarding steps | Progress bar: 6 segments, filled = step number (the images are inconsistent). Steps 1–2 **Skip** sets `business_type = other`, `channels = []`. 11: the domain changes. The shop name preview "Chat" is the WhatsApp button. 13: the "Skip" copy becomes "Skip for now · buyers can only pay on delivery until you add this"; the line about the badge reads "Your shop shows 'M-Pesa till checked by oda' once we confirm it". |
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
| 20-more, 20b-* | More section | 20b-categories (thumbnails + chevron → 20b1) is **the** categories screen, reached from both the Shop tab and More. 20b-payments: "Add another M-Pesa account" saves extra accounts; one is active (radio). 20b-your-details: the email field note becomes "Email can't be changed yet"; **drop the profile-photo button** (initials only, no avatar in the data model). 20b-reviews: text is per item; show each item's text under the review with its product chip. 20b-settings: hide Theme. |
| 20b-help | Help | Guides are bundled markdown. Support WhatsApp number from config. |
| 21-* | Change password, rate app, feedback | none (rate app uses Play in-app review). |
| NEW: notifications | Notifications list | Newest first, unread dot, tap → order/review, "Mark all read". |
| NEW: offline bar | — | Thin bar "You're offline · showing saved data". |
| NEW: delete account confirm | — | Type "DELETE" to confirm. Explains that orders/customers are removed after 30 days. |
| app-icon | Launcher icon | Adaptive icon: foreground = wordmark, background = orange. |

### 01-welcome: animated illustration (M2)

Built in code with Reanimated (no video, GIF or Lottie file), on the existing welcome illustration. Plays **once** when the screen opens, about **3 s** in total, then stays still as the static design.

1. **Shop card** floats in with a slight tilt that settles to level, on a soft spring (~600 ms).
2. A **finger-tap ripple** (a touch circle, not a mouse cursor) lands on one colour swatch; that swatch glows briefly.
3. The **"New order #1042"** notification card slides up from the bottom right with a gentle bounce.
4. **"Turn your posts into orders."** fades in with a small upward move.

Rules:
- If Android's **Remove animations** setting is on (Reanimated `useReducedMotion()`), show the static card with no motion.
- Must stay smooth on budget phones: animate only `transform` and `opacity` on the UI thread (worklets), no layout animation, no JS-thread timers, no blur/shadow animation.
- The buttons are usable immediately; the animation never blocks or delays input.

Also in M2, with the animation: **the green tick badge after "oda" sits on the text baseline, like a full stop.** Its bottom aligns with the baseline of "oda", with a small gap after the "a", matching the app icon and the web wordmark's green dot. In the M0 build it sits below the baseline.

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
