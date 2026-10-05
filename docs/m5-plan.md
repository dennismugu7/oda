# M5 plan: checkout & payment claim (approved)

Approved by the owner in Step 67 (2026-10-05) with the decisions in `decisions.md` #61. This is the working plan for M5; the acceptance criteria stay in `milestones.md`. Changes to it are recorded as new decisions.

## What already exists (M1)
- `insertOrder()` (`apps/web/server/orders.ts`): prices from the DB through `pricing.ts`, order number from `shops.order_counter`, 12-character `public_token`, payment-account snapshot, idempotency key (a repeat returns the same order, also under a race), pause / pay-now / pay-on-delivery / pickup / delivery-area checks.
- `transitionOrder()`: the shared machine decides, guarded `UPDATE … WHERE status = expected`, `order_events`, `payment_claims` with the duplicate-code flag, M-Pesa code extraction on the server.
- Shared: `next()`, `initialState()`, `stepperSteps()`, `extractMpesaCode()`, `priceOrder()`; `requireOrderToken()` + `orderTokenRepo().view()`; Postgres rate limiter (`server/rateLimit.ts`).

## Owner decisions (decision #61)
1. **Taking orders needs a payment method AND a delivery option** (≥ 1 delivery area or pickup on); otherwise "Not taking orders yet". The Delivery screen (20b-delivery) moves to the **start of M6**, with the checklist item "Add delivery options".
2. **Rate limits:**
   - order creation: per IP per shop 30 an hour (generous: mobile carriers share IPs); per phone per shop 5 an hour;
   - at most **20 open orders per phone per shop**, open = `awaiting_payment`, `awaiting_acceptance` or `payment_claimed` (pay on delivery included).
   - Also rate-limited: code submissions per order, order-link lookups per IP, "Report a problem" per order and per IP.
3. **Notification rows now, sending in M6:** `new_order`, `payment_claimed`, `switched_to_pod` and `buyer_cancelled` are written to `notifications` from the machine's side effects; push (Expo/FCM) comes in M6.
4. **Buyer emails in M5:** the receipt (order placed) and "you cancelled". Seller-triggered emails are wired in M6 (templates may be built now).
5. **Demo seed resets on every run** (the repo is public): it puts the Demo Duka settings and every sample order back to their intended states, not only adding what's missing.

No data-model changes are planned. New rules are recorded as decisions.

## Threats and abuse
| Threat | Handling |
|---|---|
| Fake or spam orders | Honeypot field; rate limits per IP and per phone; the 20-open-orders cap; a valid Kenyan phone; unpaid pay-now orders auto-expire after 48 h (hourly job in M6); the seller can cancel. |
| Guessed order links | Only the 12-character random token (72 bits) in URLs, never the order number or the uuid. A malformed or unknown token gets the same 404. `/o/*` is `noindex`, sends no referrer and is rate-limited per IP. A Playwright test checks that no order number or id appears in URLs or responses. |
| Replayed M-Pesa codes | A code is accepted only from `awaiting_payment`; a second one is refused by the machine. A code already used on another order **of the same shop** is flagged ("used on order #1031"), not blocked (spec §8). The seller confirms against their own M-Pesa. Code submissions are rate-limited per order. |
| Price tampering | The client sends only product, size, colour and qty. Prices, fees, free delivery and the total come from the DB through `pricing.ts`. The delivery area must belong to the shop (same-shop foreign key). Payment method availability is checked on the server. |
| Changed prices | The client also sends the total it showed. If the server's total differs, **no order is created**: 409 `price_changed` with the current lines; checkout shows them and blocks until the buyer reviews (milestone acceptance). |
| Double taps and retries | A client-generated idempotency key per checkout attempt; a repeat returns the same order. |
| Email bombing (someone else's address as "buyer email") | A few emails per address per day; order-only content; the buyer's name is length-limited and links are stripped. |
| "Report a problem" spam | Rate-limited per order and IP; message length cap. |
| Cross-site form spam | Order requests from other websites are refused (Origin check). |
| Token in logs | The order token is in the URL path, so it appears in Vercel's request logs (accepted, it is how the spec shares orders); our own logs never print it. |

## Following `order-lifecycle.md`
- **Create** only through `insertOrder()` (kinds `buyer_pay_now`, `buyer_pay_on_delivery`).
- **Buyer actions** only through `transitionOrder()` with the order-token scope:
  - `submitCode` (awaiting_payment → payment_claimed);
  - `switchToPod` (if the shop accepts it);
  - buyer `cancel` from `awaiting_payment`, `awaiting_acceptance`, `payment_claimed` (payment stays `claimed`, the seller resolves it in M6).
- **Nothing else** changes status. The DB guard trigger refuses any other status UPDATE; a lost race answers 409 "This order changed. Refresh and try again."
- **The pages ask the shared machine** what to show: a new helper lists the actions the buyer can take now, `stepperSteps()` gives the labels (pickup: "Ready for pickup"; `payment_claimed`: "Waiting for {shop} to confirm your payment").
- **Side effects:** the machine's side-effect list drives notification rows and emails.
- **Seller transitions** (confirm, payment not found, accept, send, deliver, cancel, refund) are M6. Tests use `transitionOrder()` directly.

## Demo shop (staging demo seed, reset on every run)
- **Payment:** pay now and pay on delivery both on. Fake Till `000000` named "DEMO DUKA · TEST ONLY". A "Demo shop: don't send money" banner on Demo Duka pages and its pay page, switched on by config `DEMO_SHOP_SLUGS` (no DB column).
- **Delivery:**
  - CBD KES 200 (rider, "Same day", free-delivery eligible);
  - Westlands KES 300 (rider);
  - Upcountry KES 450 (parcel, not eligible);
  - pickup "Demo pickup point";
  - free delivery over KES 5,000.
- **Sample orders**, made with `insertOrder()` / `transitionOrder()` and reset to these states on every run: awaiting payment, payment claimed, payment not found (back to awaiting payment with the banner), confirmed, sent (rider phone), ready for pickup, delivered, cancelled (reason label), expired. Their links go to the workflow's job summary (fake orders; anyone with repo access could open them).

## Checkpoints
- **CP1, server:**
  - `POST` checkout endpoint: zod whitelist, re-pricing, the price-change check, idempotency key, rate limits, honeypot, Origin check, the 20-open cap, the `takingOrders` rule with the delivery option;
  - buyer endpoints on `/o/{token}`: code, switch to pay on delivery, cancel, report a problem;
  - deleted shop (decision #38): the link works until the purge with a "This shop has closed" banner and only "Report a problem";
  - notification rows, receipt + cancelled emails hooked to the side effects;
  - tests incl. authorization.
- **CP2, checkout page (4-checkout):**
  - details (name, phone, WhatsApp toggle, optional email, privacy note), delivery radio list + address, pickup, payment radios, "Place order · KES x", footer;
  - the cart's button goes to checkout;
  - the `?s=` source is kept on the device per shop until the order;
  - demo seed changes.
  - → **Review stop A:** the owner places a pay-on-delivery and a pay-now order on Demo Duka from the phone.
- **CP3, pay page and order page:**
  - pay page (04b redesign): "Pay KES x to {shop}", instructions per account type with copyable numbers, account name, live code extraction, I've paid, Pay on delivery instead, Cancel order;
  - order page (05, 6, 05c): placed, timeline with times, cancel card (refund copy after a claim), "payment not found" banner, sent method + rider phone, delivered "Rate your order" (inactive until M7), cancelled/expired states with the reason label (never `cancel_note`), Message {shop}, Report a problem;
  - demo sample orders.
- **CP4, buyer emails:** receipt and "you cancelled" (decision 4), with the order link; logged by kind and recipient domain only.
- **CP5, wrap-up:**
  - Playwright acceptance: full pay-now and pay-on-delivery orders, a price change after add-to-cart caught, order links can't be guessed, the rate limit triggers;
  - accessibility pass, design comparison (4-checkout, 04b, 05, 6, 05c);
  - → **Review stop B** with a numbered phone test list.
- No app changes: no EAS Update or native build in M5.

## Phone test plan (review stop B, draft)
1. Pay on delivery to CBD: total = items + KES 200 → "Order placed!" with the bookmark note.
2. A cart over KES 5,000 to CBD → free delivery; Upcountry still KES 450.
3. Pickup: no address field; the order later reads "Ready for pickup".
4. Pay now: exact Till instructions, copy buttons, "You'll see DEMO DUKA · TEST ONLY".
5. Paste a fake M-Pesa SMS: the code shows live → I've paid → "Waiting for Demo Duka to confirm your payment".
6. "Pay on delivery instead" → the order is awaiting acceptance.
7. Cancel before confirmation works; after a claim, the cancel copy mentions the refund.
8. Demo sample orders: payment-not-found banner, sent with rider phone, delivered (rate card inactive), cancelled with a reason label, expired.
9. Change one character of an order link → the oda 404.
10. Report a problem → thank-you message.
11. Double-tap Place order → one order.
12. Optional: give an email at checkout → the receipt arrives.
