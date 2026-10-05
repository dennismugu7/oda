# M6 plan: seller order management (approved)

Proposed in owner Step 71, **approved in owner Step 72 (2026-10-05)** with the additions in `decisions.md` #65 (summarised in "Owner's additions" below). This is the working plan for M6; the acceptance criteria stay in `milestones.md` (M6). Changes to it are recorded as new decisions.

## Owner's additions (decision #65)
1. **Push:** tapping a notification opens that order's detail. The Expo push token is registered on sign-in and removed on sign-out (that phone gets no more pushes). Enhanced push security: **on**. `EXPO_ACCESS_TOKEN` goes in Vercel; the owner gets the steps when needed.
2. **`CRON_SECRET`:** Claude generates it and pipes it into Vercel and GitHub Secrets without printing it. If the GitHub secret can't be set cleanly that way, the owner gets the steps instead.
3. **One native build 0.3.0 at CP4** (expo-notifications + Firebase config). Before building, list every other native module needed through M10 so it's batched into the same build, and ask the owner with the download size.
4. **Firebase/FCM steps** go to the owner when CP4 starts (not before), **one step at a time**.

## What M5 left ready
- `insertOrder()` / `transitionOrder()` with every seller action in the shared machine (confirm, payment not found, mark paid, accept, mark sent, mark delivered with "collected", cancel with the claim question, resolve claim, refund sent) and `autoExpire`; the DB status guard.
- Notification rows written from every push side effect (`new_order`, `payment_claimed`, `switched_to_pod`, `buyer_cancelled`, `order_expired`) in the same transaction.
- Buyer emails sent after the response (`sendOrderEmails`, receipt + "you cancelled"), with a per-address daily limit.
- `profiles.expo_push_tokens text[]`, `notifications.read_at`, order indexes for To-do / search (`(shop_id, status, placed_at)`, `(shop_id, buyer_phone)`, expiry index).

## Checkpoints

**CP1 · Delivery (20b-delivery), server + screen** — first, so real shops can take orders.
- API: `GET/PUT /api/delivery` (pickup on/off + location + hours, free-delivery threshold), `POST/PATCH/DELETE /api/delivery/areas[/:id]` (name, fee, method rider/parcel, ETA text, free-delivery eligible; soft delete; `PUT /api/delivery/areas/order`). zod whitelists; authorization tests (another seller's areas = 404).
- Screen 20b-delivery from More and from the Finish-your-shop checklist; the checklist item "Add delivery options" (done with ≥ 1 area or pickup on; computed, not stored).
- Shipped as an **EAS Update**.

**CP2 · Orders API + list + detail (17-\*, 17b-\*)**
- API: `GET /api/orders` (tabs To do / All / Done, To-do groups per `todoGroup()`, search by buyer name, phone or order number, paging), `GET /api/orders/:id` (items, buyer, delivery, totals, account snapshot, claims with the duplicate-code flag, source "via TikTok", events), `POST /api/orders/:id/actions` (one endpoint, body = the machine's action; only through `transitionOrder()`; 409 on a lost race). Authorization tests for every route.
- Screens: Orders tab (list, tabs, groups, search), order detail with the stepper and the action for the current state: Confirm payment sheet (checkbox "amount and code match"), Payment isn't in my M-Pesa, Mark paid, Accept, Mark as sent (rider / parcel / pickup, optional rider phone), Mark as delivered (pay on delivery: "I've collected KES x"), Cancel (reason chips; claimed → "Did you receive KES x?"; paid → refund reminder), refund banner + Mark refund sent, resolve a claim on a buyer-cancelled order.
- **WhatsApp prefill:** after each action whose side effects include `whatsapp`, a "Tell {buyer} on WhatsApp" toggle opens `wa.me/<buyer>?text=…` on the seller's phone (messages from a shared template file, unit-tested). Call / WhatsApp buttons on the buyer card.
- **Seller-triggered buyer emails** (decision #61 f): payment confirmed, accepted, sent, delivered, cancelled (by the seller, with the reason label), expired, refunded — the templates join `sendOrderEmails()`. Flag: the delivered email's "leave a review" link points at the order page until reviews exist (M7).
- EAS Update.
- → 🛑 **Review stop A** (phone): Delivery screen; an order placed on the web shows in the list; drive it through every action from the phone.

**CP3 · Home (15, 16) + manual orders + in-app notifications**
- Home: To-do card (tabs To confirm / To send / New with counts and a quick Confirm), sales this week (Mon–Sun bars in Nairobi time, % vs last week, sales = confirmed/sent/delivered by `confirmed_at`), top-source line, empty state (15).
- **New order** (manual): buyer name + phone, items from the catalogue (size/colour/qty), delivery fee override, payment Already paid / Not paid yet / Pay on delivery → `insertOrder()` with the manual kinds; "Not paid yet" shows the order link to send (Copy / WhatsApp).
- Notifications list (new screen, design-changes): bell with an unread count on Home, list from `notifications`, tap → order, mark read (`PATCH /api/notifications/read`).
- EAS Update.

**CP4 · Push (native build 0.3.0) + auto-expire job**
- App: `expo-notifications` (installed with `pnpm exec expo install`), Firebase config wired in `app.config.ts`, permission prompt after sign-in (Android 13+), register the Expo push token on sign-in → `POST /api/me/push-tokens`, remove it on sign-out (`DELETE`, so that phone gets no more pushes); tapping a notification opens that order's detail.
- Server: send through the Expo push API in `after()` for each push side effect (same text as the notification row); tokens Expo reports as `DeviceNotRegistered` are removed; sends logged by type only (no tokens, no buyer data).
- **Auto-expire:** `POST /api/cron/expire-orders` runs `transitionOrder({kind:'system'}, autoExpire)` for buyer-placed orders in `awaiting_payment` whose `awaiting_payment_since` is ≥ 48 h old (batches of 100; manual orders never), sending push `order_expired` and the "expired" email. Protected by the header `Authorization: Bearer <CRON_SECRET>` (constant-time compare; 404 without it), called hourly by a GitHub Actions schedule (`cron-expire-orders.yml`, also runnable by hand). Tests with backdated orders.
- **One native build** (version 0.3.0) with everything native M6 needs, plus any native module needed through M10 (listed and approved first, #65); everything else stays EAS Update.
- → 🛑 **Review stop B** (phone, end to end).

**CP5 · Wrap-up:** forbidden transitions rejected by the server (tests per action), Playwright for any new web pages, design comparison (20b-delivery, 15, 16, 17-\*, 17b-\*, mark-delivered, refund banner, notifications), accessibility pass → **M6 gate**.

## Native build vs EAS Update
| Change | Ships as |
|---|---|
| Delivery screen, orders list/detail, actions, WhatsApp links (`Linking`), Home, manual orders, notifications list | EAS Update (runtime 0.2.0) |
| `expo-notifications` + Firebase config (`google-services.json`) | **Native build 0.3.0** (version bump, decision #48) |

All native changes are batched into that one build at CP4. Before it, I list every native module needed through M10 (e.g. for M7 review photos, M8 share images/QR, in-app review, M10 Sentry) so they go into the same build. Local build per decision #23 (`pnpm --filter @oda/seller android`), or EAS if local fails. **I'll ask before building, with the download size** (expo-notifications + Firebase messaging Gradle dependencies; I'll check the Gradle cache first). Until 0.3.0 is installed, the phone keeps receiving CP1–CP3 as EAS Updates on 0.2.0.

## What I need from you for push (sent when CP4 starts, one step at a time; nothing goes in the chat)
1. **Firebase project:** https://console.firebase.google.com → Add project → name `oda` → Google Analytics **off** → Create.
2. **Register the Android app:** in the project, Add app → Android → package name **`com.mugulabs.oda`** (exactly), nickname `oda` → Register. Skip the SHA-1 step.
3. **Download `google-services.json`** from that screen and save it on the laptop as `C:\Users\denni\projects\oda\apps\seller\google-services.json`. It will be **gitignored** (the repo is public). Then upload the same file to EAS for EAS builds: expo.dev → project `oda` → Environment variables → Add → name `GOOGLE_SERVICES_JSON`, type **File**, environments development + preview, visibility **Secret** → upload. Tell me when both are done (I check by name/path only).
4. **FCM V1 key for Expo:** Firebase console → ⚙ Project settings → Service accounts → **Generate new private key** (a JSON file). Then expo.dev → project `oda` → Credentials → Android → `com.mugulabs.oda` → **FCM V1 service account key** → Upload that JSON. Afterwards delete the downloaded key file from Downloads. It never goes into the repo, Vercel or the chat.
5. **Expo access token for sending (recommended):** expo.dev → Account settings → Access tokens → Create (name `oda-push-staging`) → copy it straight into Vercel → oda → Settings → Environment Variables → `EXPO_ACCESS_TOKEN` (Production + Preview, Sensitive). Then in expo.dev → project → Settings, turn on **"Enhanced security for push notifications"** so only our server can send (approved: on).
6. **`CRON_SECRET`** (approved, #65): I generate it on the laptop and pipe it straight into `gh secret set CRON_SECRET` and `vercel env add CRON_SECRET` (Production + Preview) without printing it, and verify by name. If the GitHub secret can't be set cleanly that way, you get the steps instead.

## Flags (spec / data model)
- **No data-model change planned.** Existing columns cover push tokens (`profiles.expo_push_tokens`), notifications (`read_at`), manual orders, refunds and delivery areas. If token housekeeping needs more (e.g. per-device last-seen), I'll stop and propose it.
- **Spec:** the delivered email's review link → the order page until M7; the notification for a new review is M7.
- **Spec §8 offline:** the orders list/detail show cached data read-only with "You're offline" (as the catalogue does), no queued actions.
- `docs/data-model.md` → "Where logic runs" lists `/api/cron/expire-orders`; protection detail (Bearer `CRON_SECRET`) gets recorded as a decision.

## Phone test plan (review stop B, draft) — buyer on the web, seller on the phone
1. Install build 0.3.0; sign in; allow notifications.
2. Delivery screen: add "CBD KES 200" + pickup → your shop's page no longer says "Not taking orders yet".
3. Buyer (web, another phone or a laptop): place a **pay-now** order on your shop → **push "New order #…" within 10 s**; tap it → the order detail.
4. Buyer pastes a fake M-Pesa SMS → push "{buyer} says they paid"; seller **Payment isn't in my M-Pesa** → the buyer's page shows the banner; WhatsApp prefill opens.
5. Buyer resubmits; seller **Confirm payment** (checkbox) → buyer page "Paid & confirmed"; email if given.
6. Seller **Mark as sent** (rider + phone) → buyer sees the rider link; **Mark as delivered** → buyer sees Delivered.
7. A **pay-on-delivery** order: push; seller **Accept** → **Sent (pickup)** → **Delivered** with "I've collected KES x" required.
8. Buyer cancels a fresh order → push "{buyer} cancelled"; a claimed-then-cancelled order asks "Did you receive KES x?" → refund banner → Mark refund sent.
9. Home: To-do counts and the sales bar update; notifications list shows each event, tapping opens the order.
10. Manual order "Not paid yet" → copy its link → open it on the web → pay page.
11. A forbidden action (e.g. two phones racing to accept) → "This order changed. Refresh and try again."
12. Auto-expire: I backdate a staging test order and run the job by hand (Actions → cron-expire-orders → Run) → push "#… expired", buyer page "Order expired".
