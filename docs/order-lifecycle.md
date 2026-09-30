# Order lifecycle

Implement this as **one pure state machine in `packages/shared`** (for example `orderMachine.ts`), used by the server API to validate every transition and by both UIs to decide which actions and labels to show. It must be unit-tested for every allowed and every forbidden transition. For where it executes, see `data-model.md` → "Where logic runs" (`transitionOrder()`).

## Statuses (in progress order)

| # | Status | Meaning | Seller "To do" group |
|---|---|---|---|
| 1 | `awaiting_payment` | Pay-now order placed; the buyer hasn't submitted an M-Pesa code yet | New · awaiting payment |
| 1 | `awaiting_acceptance` | Pay-on-delivery order placed | New · to accept |
| 2 | `payment_claimed` | Buyer submitted an M-Pesa code ("Says paid") | **Confirm payment** |
| 3 | `confirmed` | Seller confirmed payment (pay now) or accepted (pay on delivery) | **To send** |
| 4 | `sent` | Handed to a rider / parcel service, or ready for pickup | — |
| 5 | `delivered` | Buyer received it (terminal) | — |
| — | `cancelled` | Cancelled by the buyer, the seller or the system (terminal) | — |

`payment_status` is a separate field: `unpaid` → `claimed` → `paid`, plus `refund_due` → `refunded`.

## Transitions

"Email" means an email to the buyer, sent only if they gave an address. "WA" means an optional pre-written WhatsApp message opened on the seller's phone.

| From | Action | Who | To | Side effects |
|---|---|---|---|---|
| — | place order (pay now) | buyer | `awaiting_payment` | push `new_order`; email receipt |
| — | place order (pay on delivery) | buyer | `awaiting_acceptance` | push `new_order`; email receipt |
| — | manual order: already paid | seller | `confirmed` (method `pay_before`, payment `paid`) | — |
| — | manual order: not paid yet | seller | `awaiting_payment` (**exempt from auto-expire**) | order link shown to seller to send |
| — | manual order: pay on delivery | seller | `confirmed` (method `pay_on_delivery`, payment `unpaid`) | — |
| `awaiting_payment` | submit M-Pesa code | buyer | `payment_claimed` (payment `claimed`) | push `payment_claimed`; duplicate-code check (flag, don't block) |
| `awaiting_payment` | switch to pay on delivery (if the shop accepts it) | buyer | `awaiting_acceptance` (method `pay_on_delivery`) | push `switched_to_pod` |
| `awaiting_payment` | mark paid (seller saw the money without a code) | seller | `confirmed` (payment `paid`) | email |
| `payment_claimed` | confirm payment | seller | `confirmed` (payment `paid`) | email; WA |
| `payment_claimed` | payment not found | seller | `awaiting_payment` (payment `unpaid`; claim kept with outcome `not_found`) | buyer page banner; WA |
| `awaiting_acceptance` | accept | seller | `confirmed` | email |
| `confirmed` | mark as sent (method, rider phone?) | seller | `sent` | email; WA |
| `sent` | mark as delivered (pay on delivery: "I've collected KES x" required) | seller | `delivered` (pay on delivery → payment `paid`) | review unlocked; email with review link; WA |
| `awaiting_payment`, `awaiting_acceptance` | cancel | buyer | `cancelled` | push `buyer_cancelled`; email |
| `payment_claimed` | cancel | buyer | `cancelled` (payment stays `claimed`) | push `buyer_cancelled`; the seller must resolve the claim (below) |
| any non-terminal | cancel (reason) | seller | `cancelled` | email; WA. If payment `claimed`: the seller answers "Did you receive KES x?" → yes = `refund_due`, no = `unpaid`. If payment `paid` → `refund_due`. |
| cancelled order with payment `claimed` | resolve claim: received / not received | seller | payment `refund_due` / `unpaid` | — |
| payment `refund_due` | mark refund sent | seller | payment `refunded` | email |
| `awaiting_payment` (buyer-placed) for 48h | auto-expire | system (`/api/cron/expire-orders`, hourly) | `cancelled` (reason `expired`) | push `order_expired`; email |

Anything not listed is forbidden and must return a clear error.

## What counts as a sale (Home, Insights, Bestseller, Popular)
- An order counts as a **sale** while its status is `confirmed`, `sent` or `delivered`. It is dated by `confirmed_at`, bucketed in Africa/Nairobi time. Cancelling it removes it.
- `products.units_sold` = the sum of qty over sale orders. `shops.delivered_count` = the number of `delivered` orders.
- Sales total = the sum of `total` (including delivery fees) over sale orders in the period.

## Stepper labels

The same four steps in both apps. Step n is done when the status number (table above) is ≥ the one shown:

| Step | Buyer web label | Seller app label | Done at |
|---|---|---|---|
| 1 | Order placed | Received | 1 |
| 2 | Paid & confirmed / Accepted by {shop} | Payment / Accepted | 3 |
| 3 | Sent out | Sent | 4 |
| 4 | Delivered | Delivered | 5 |

`payment_claimed` shows step 2 as "in progress" ("Waiting for {shop} to confirm your payment"). Step 5 on the buyer web, "Rate your order", unlocks at `delivered`.

## Money
`subtotal = Σ(line.unit_price × qty)` with unit prices read from the DB. `delivery_fee` = the chosen area's fee, or 0 for pickup, or 0 if free delivery applies (area eligible and subtotal ≥ threshold). **Exception:** on seller-created manual orders the seller may override the delivery fee (`deliveryFeeOverride`, ≥ 0). Item prices are never overridden. `total = subtotal + delivery_fee`. Integer KES. Computed only by `packages/shared/pricing.ts` on the server. Line items snapshot the product name, options, unit price and thumbnail at order time.

## Order numbers & tokens
- `orders.number`: sequential per shop, starting at 1001, taken from `shops.order_counter` inside the insert transaction.
- `orders.public_token`: 12 random URL-safe characters. The only way a buyer reaches an order.
- Paybill account reference shown to the buyer = `payment_accounts.account_ref` when `account_ref_mode = fixed`, or the order number when `order_number`.
