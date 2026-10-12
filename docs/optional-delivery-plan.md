# Optional delivery: plan (reverses decision #61 c)

**Status:** plan only, waiting for the owner's answers (review stop 0). No code in this step.
**Branch:** `optional-delivery-plan`, from `app-fixes-1` (PR #111, which holds the shared ordering rule this plan changes).

**Owner decision (2026-10-12):** delivery and pickup become **optional**. A seller is never forced to publish delivery areas or a pickup location. A shop **takes orders when it is not paused and has a way to get paid**. When the seller has no delivery option, buyer and seller arrange how the order reaches the buyer between them (usually on WhatsApp).

Recommendations are marked **(R)**. Open questions are in §8 and are numbered Q1–Q9.

---

## 1. The ordering rule

| Where | Today | Change |
|---|---|---|
| `packages/shared/src/ordering.ts` | `OrderingFacts.hasDeliveryOption`; blockers `delivery`, `payment`, `paused` | Drop `hasDeliveryOption` from `OrderingFacts` and `orderingFacts()` (the `pickupEnabled` / `hasDeliveryArea` inputs go too). `OrderingBlocker = 'payment' \| 'paused'`. `takingOrders` = not paused and (pay now or pay on delivery). |
| `apps/web/server/storefront.ts` → `takingOrders` | re-export | Unchanged (it re-exports the shared rule). |
| `apps/web/server/repos/public.ts` | computes `hasDeliveryOption` for `orderingFacts` | It stops passing it to the rule. `PublicShop` still needs "has areas / pickup" for checkout (§2); that becomes a separate field `deliveryOptions: 'listed' \| 'none'`. |
| `apps/web/server/checkout.ts:100` | `not_taking_orders` 409 also without delivery | Follows the shared rule (only paused / no payment). |
| `/api/home` (`repos/sellerHome.ts`) | `ordering.blockers` may contain `delivery` | It never sends `delivery`. The query no longer reads delivery areas for this. |
| Home banner (`NotTakingOrdersBanner.tsx`, PR #111) | three actions | Only **"Add a way to get paid"** and **"Turn off Pause shop"**. The `delivery` entry is removed. An older app that still knows `delivery` simply never receives it. |
| "Finish your shop" (`packages/shared/src/onboarding.ts`) | "Add delivery options", moved first by #109 c | It stays an **optional** item at its old position. #109 c's "delivery first" is undone because delivery no longer blocks orders. See Q5 for when it counts as done. |

**PR #111:** its fix 3 is still a draft, so I'd change the rule in a new commit on top of `app-fixes-1` (CP1), not by rewriting #111's commit. Decision #109 c then stays accurate as history, amended by the new decision. **(R)**

## 2. Checkout

### 2a. The seller has no delivery area and pickup is off
- **No "Delivery" radio step.** In its place, one card: **"Delivery: The seller will contact you to arrange delivery."**
- **An optional field "Note for the seller"**, with the placeholder "Where you are, when suits you…". Up to 300 characters, links stripped like the buyer name.
- **No address is required. No fee:** the totals show "Delivery · Arranged with {shop}", and Place order shows the items total only.
- **The quote** (`POST /api/shops/:slug/quote`) returns one option `{ kind: 'arranged', fee: 0 }`.
- **The order request** sends `fulfilment: { kind: 'arranged', note? }`.
- **The server accepts `arranged` from a buyer only when the shop really has no area and pickup is off** (unless Q1 adds a toggle). Otherwise it refuses with 422 "Choose delivery or pickup.", the way it already refuses pickup when pickup is off.
- **The money rule is unchanged:** `pricing.ts` gets `delivery: { kind: 'arranged' }` → fee 0, and `total = subtotal + 0`. Free delivery doesn't apply.
- **Delivery cost is not in the order total.** If the seller charges for delivery, the buyer pays that separately, as they agree (see Q3). Checkout, the order page and the receipt say so: "Delivery isn't included: {shop} will tell you the cost, if any."

### 2b. The seller has areas or pickup: should checkout also offer "Arrange with seller"?

| | Offer it too | Don't offer it (R for now) |
|---|---|---|
| Buyers outside the listed areas | Can still order: no lost sale | Must message the seller first; the seller can make a manual order |
| Seller's predictability | Lower: any buyer can skip the fee and the area, so more chatting per order | Unchanged: listed areas still mean a fixed fee and an address |
| Totals | Often understate what the buyer pays (delivery is settled outside) | Accurate for delivery orders |
| Abuse / mistakes | Buyers may pick it to dodge a fee they then argue about | None new |
| Build cost | A shop setting (`shops.arranged_delivery boolean default false`, additive migration), a toggle on the Delivery screen, checkout and server rules | None |

**(R):** don't offer it automatically. If you want it, add it as a **seller toggle** on the Delivery screen, **"Buyers can arrange delivery with you"**, off by default for shops that list areas or pickup. Existing shops would then behave exactly as today. This is Q1; it would be checkpoint CP2b. Meanwhile the seller app's **New order** always offers "Arrange with buyer" (§3), so a seller can still serve a buyer outside their areas.

### 2c. Other buyer pages
- **Product page delivery card:** with no options it reads **"Delivery: arranged with the seller after you order"**. The payment card is unchanged.
- **Cart:** the delivery row says **"Arranged with the seller"** instead of "Calculated at checkout".
- **Free-delivery banner:** shown only when the shop has at least one area that is eligible for free delivery. Today a threshold with no areas would show a promise checkout can't keep.
- **The shop page "Not taking orders yet" banner:** now only for no way to pay. Paused keeps its own "{shop} is taking a break".

## 3. Orders

### Data model (migration 0010, expand only)
- **`ALTER TYPE fulfilment ADD VALUE 'arranged'`:**
  - It is additive, so the old deployment keeps working on the new schema; no new code writes `arranged` until it is deployed.
  - It is a plain migration step. Postgres allows `ADD VALUE` inside the migration transaction, as long as nothing in the same migration uses the value.
  - There is nothing to contract later.
- **The existing check `orders_pickup_has_no_area`** (`fulfilment = 'delivery' or delivery_area_id is null`) already holds for `arranged`, so it is unchanged.
- **The buyer's note** goes in the existing **`address_text`** column: for `arranged` it is the buyer's free text. **(R, Q4)** That means:
  - no new column;
  - retention and purge already cover it;
  - `data-model.md` documents the meaning per fulfilment.
- **The alternative** is a new nullable `buyer_note` column, which is additive too.
- `sent_method` keeps `rider` / `parcel` / `pickup`, with no enum change (see "Mark as sent" below).
- **Shared types:**
  - `Fulfilment = 'delivery' | 'pickup' | 'arranged'`;
  - `checkoutFulfilment` and `manualOrderInput` get a `{ kind: 'arranged', note }` branch;
  - `data-model.md` lists the enum.

### Where it shows

| Place | Today | For `arranged` |
|---|---|---|
| Web order page `/o/{token}`: delivery row | "Delivery · {area}" + address, or "Pickup" + place | **"Delivery · Arranged with {shop}"** + the note, if any |
| Order page / receipt, pay on delivery | "…will accept your order and get it to you. You pay X on delivery." | "…will **contact you to arrange delivery**. You pay X when you get your order." |
| Order page help card | "Message {shop} on WhatsApp" | Same button, moved up, labelled **"Message {shop} to arrange delivery"** (prefilled with the order number) |
| Buyer timeline note (`orderMachine.ts`) | pickup / delivery notes | "{shop} will contact you to arrange delivery" |
| Stepper (shared `stepperSteps`) | step 3 "Sent out" / pickup "Ready for pickup" | Step 3 **"Sent out"**; if the seller marked it "Buyer collects", **"Ready to collect"**. `stepperSteps` also takes `sentMethod` for this. |
| App order detail: delivery card | DELIVERY / PICKUP | **"ARRANGED WITH BUYER"**, the buyer's note, and a WhatsApp button prefilled "Hi {name}, about delivery for order #n…" |
| App **Mark as sent** sheet | rider / parcel, or pickup | Three choices: **By rider**, **By parcel**, **Buyer collects** (stored as `pickup`). The title is "Mark as sent" (it becomes "Mark ready to collect" when Buyer collects is chosen); the sub-line reads "to {buyer}". |
| App **New order** (manual) | pickup or an area (fee editable) | Adds **"Arrange with buyer"** (always available), with the fee field defaulting to 0 and editable as today |
| Emails, receipt | "Delivery · {area}: fee" / "Pickup: Free" | "Delivery: arranged with {shop} · not included" |
| Emails, sent | rider / parcel / "Ready for pickup at {place}" | Rider and parcel unchanged. Buyer collects: "Your order {n} is ready to collect. {shop} will tell you where, if they haven't already." |
| Push / Notifications list: `new_order` | "{buyer} · KSh x · Pay on delivery" | Adds " · **Arrange delivery**", so the seller knows to message the buyer. Server-made, so old apps show it too. |
| Insights | Sales and orders don't split by fulfilment | **No change**: arranged orders count like any other. The More tab's Delivery row shows **"Arranged with buyers"** instead of "Add an area" when there are no options. |
| Demo seed (`server/demoSeed/orders.ts`) | 9 sample orders | One more: **"Arranged with buyer · pay on delivery · accepted"**. It's made as a manual order, since Demo Duka keeps its areas and the server refuses buyer `arranged` there unless Q1 adds the toggle. |
| Staging regression (`regression/staging.regression.ts`) | 1.14 "Before delivery options: not taking orders yet" | 1.14 becomes **"No delivery options: the shop takes orders"**: checkout shows the arrange card and places an arranged order. A new step marks it sent (Buyer collects) and delivered. 2.16 (manual) adds an arranged variant. |

**Old app versions** (0.4.0 / 0.5.0 without the update) read `fulfilment !== 'pickup'` as delivery. An arranged order would show as "Delivery" with no area or address, and Mark as sent would default to rider. Nothing breaks, and the next EAS Update or build fixes the labels.

## 4. Payment
- **Pay now** works unchanged for arranged orders: the pay page, I've paid and the seller's confirm. The pay page adds one line: "Delivery isn't included: arrange it with {shop}."
- **Pay on delivery** also works unchanged; the `pay_on_delivery` enum and the machine are untouched. On a pay-on-delivery order, the seller ticks "I've collected KSh x" at delivery, as today.
- **Wording:** "Pay on delivery" stays as the option's name (shop footer, product card, Payments settings, terms). Only the sub-lines change for arranged orders:
  - checkout radio sub-line: **"Pay when you get your order"** (delivery today: "Pay when it arrives"; pickup: "Pay when you collect it");
  - order page: "Pay when you get it";
  - sent email: "Have KSh x ready when you get your order".
- **No change** to the expiry, the cap of 20 open orders, or the rate limits.

## 5. Every "Not taking orders yet because of delivery"

| Place | Change |
|---|---|
| App Delivery screen: warning card (`delivery/index.tsx:243`, `NO_ORDERS_WARNING`) | Replaced by an info line: **"Delivery areas and pickup are optional. Without them, buyers order and you arrange delivery with them, usually on WhatsApp."** |
| App Delivery: "Stop taking orders?" sheet when turning pickup off | **Removed**: pickup turns off straight away. This is one of #109 a's eleven confirmations; it goes away. |
| App Delivery: delete the last area | Keeps the usual "Delete area?" confirmation. The "your shop will show Not taking orders yet" sentence goes, here and in `delivery/area.tsx:118`. |
| `/api/delivery` → `hasDeliveryOption` | **Kept** (it's still a true fact, and old apps read it). Old apps keep showing the old warning until they update. |
| Help guide (`src/help/guides.ts` and `docs/help-guides.md`, word for word) | "**You need one way to deliver.** …" → **"Delivery is optional.** Without areas or pickup, buyers can still order and you arrange delivery with them on WhatsApp. Their order shows *Arranged with buyer*." Plus one sentence on "Buyer collects" under "Sending an order". |
| Web shop / product / cart / checkout "Not taking orders yet" | Same text; it now appears only without a way to get paid |
| `docs/spec.md` §5.2 (line 61), §5.3 checklist, §5.7 Delivery, §6 checkout step 2, order page | Amended (§6) |
| `docs/m5-plan.md`, `docs/m6-plan.md`, old progress entries | **Unchanged**: they are history |

## 6. Docs, decision, privacy
- **Decision #110** (appended): "Delivery and pickup are optional (owner; reverses #61 c, amends #109 c and the delivery part of #62 h)". It records the rule, the `arranged` fulfilment, the checkout copy, the note in `address_text` (or the new column), and the answers to Q1–Q9.
- **Specs:**
  - `spec.md`: §5.2, §5.3, §5.7, §6 checkout step 2, the order page, the help guides.
  - `order-lifecycle.md`: Stepper labels and Money (fee 0 for arranged).
  - `data-model.md`: the fulfilment enum and `address_text`.
  - `design-changes.md`: the 4-checkout row gets "no options: the arrange card"; the 20b-delivery row gets "optional" in place of the warning.
- **Privacy** (`apps/web/app/privacy/page.tsx`): "Your delivery area and address, or that you will pick up." becomes "Your delivery area and address, that you will pick up, or that you will arrange delivery with the seller, **and any note you leave for the seller**." The "Who sees your data" line already says the seller sees "delivery details", so it is unchanged. **Terms: no change** (sellers already promise to deliver what was ordered).

## 7. Tests, checkpoints, shipping

### Tests
- **Shared (Vitest):**
  - `ordering.test.ts`: no delivery blocker, and no options still takes orders;
  - `checkout.test.ts`: the arranged branch, the note length and link stripping;
  - `pricing` with arranged → fee 0;
  - `stepperSteps` with arranged + sentMethod;
  - the onboarding checklist order (delivery back in its old place) and its done rule (Q5).
- **Server (Vitest against Postgres):**
  - `checkout.test.ts`: an arranged order on a shop with no options, which is refused when the shop has areas or pickup;
  - the quote's single arranged option;
  - `sellerHome.test.ts`: blockers never contain delivery;
  - `orders.test.ts`: a manual arranged order with a fee override;
  - `email.test.ts`: receipt and sent texts;
  - `push.test.ts`: the `new_order` text;
  - `authz.test.ts`: the note is only on the token page and the seller's own order;
  - `migrate.test.ts`: the enum value;
  - the demo seed count (10).
- **Seller app (jest + RNTL):**
  - Home banner (payment, paused, both, none, and an unknown `delivery` blocker ignored);
  - Delivery screen (info line, pickup turns off without a sheet);
  - order detail (arranged card, WhatsApp prefill);
  - Mark as sent (three choices, Buyer collects);
  - New order "Arrange with buyer";
  - the More row;
  - the help-guide match test.
- **Web (Playwright):**
  - `checkout.spec.ts`: a no-options shop shows the arrange card, no address required, the totals without delivery, then pay on delivery and pay now;
  - `order.spec.ts`: the arranged order page and the WhatsApp button;
  - `a11y.spec.ts` covers the new card.
- **Regression:** the updated script (§3). It can't run until the Resend key is restored (Handoff note), so it is checked by `tsc` only.

### Checkpoints (each one a review stop)
1. **CP1: shared + server + migration.**
   - What: migration 0010 (enum), shared types, rule and pricing; checkout / quote / insertOrder; `/api/home`; emails and push texts; tests.
   - Branch from `app-fixes-1`, a draft PR.
   - **Review stop A:** I show the server tests and the email/push texts.
2. **CP2: buyer web.**
   - What: checkout, cart, product card, shop banners, order page, pay page, privacy text; Playwright; screenshots at 390 × 844.
   - **Review stop B.** **CP2b** (only if Q1 = toggle): the shop setting, its migration and the Delivery toggle.
3. **CP3: seller app (JS only).**
   - What: the Home banner, Delivery screens, order detail, Mark as sent, New order, the More row, Help; UI tests; screenshots.
   - **Review stop C.**
4. **CP4: demo seed, regression script, docs** (spec, lifecycle, data model, design-changes, help-guides, decision #110, progress).
   - `check:all` and every PR check green.
   - **Review stop D:** merge order and staging phone test list.

**JS-only for the app:** yes. No new native module and no `app.json` / runtime change, so `deps:check` and the runtime snapshot stay unchanged. It ships with 0.5.0, or by EAS Update when you say so.

**Merge order:** the server part (CP1 + CP2) can reach `main` and staging before the 0.5.0 app stack. The app tolerates both server versions: it ignores an unknown blocker and shows unknown fulfilment as "Delivery". This is the natural moment to split #111's server part out of the app stack (Q8).

**Production effect:** on the first release-production after merge, **every production shop that has a way to get paid but no delivery option starts taking orders immediately**. That includes faraja-styles (Q9).

## 8. Open questions (with my recommendation)

| # | Question | Recommendation |
|---|---|---|
| Q1 | When the seller lists areas or pickup, should checkout also offer "Arrange with seller"? | **Not automatically.** If yes, make it a seller toggle on Delivery, off by default (CP2b, one boolean column). See the trade-off in §2b. |
| Q2 | The value name in the database | **`arranged`** (buyer label "Arranged with {shop}", seller label "Arranged with buyer"). |
| Q3 | Delivery cost on arranged orders: outside the total, or can the seller add a fee later? | **Outside the total in v1.** Changing an order's total after placing touches pay-now amounts, claims and refunds (the money rules); a later decision if sellers ask. Manual orders already let the seller set a fee up front. |
| Q4 | Where the buyer's note lives | **In `address_text`** (no new column, purge already covers it). The alternative is a new `buyer_note` column usable on all orders. |
| Q5 | When "Add delivery options" counts as done, now that it is optional | **Done with an area, pickup, or a tap on "I'll arrange delivery with buyers"** on the Delivery screen (stored in `shops.checklist`, like "share link"; no migration). Otherwise the checklist never hides for sellers who don't deliver. |
| Q6 | "Mark as sent" for arranged orders | **By rider / By parcel / Buyer collects** (`pickup` sent method, labelled "Ready to collect"); no enum change. |
| Q7 | Wording for pay on delivery on arranged orders | **Keep "Pay on delivery"** as the name; sub-line "Pay when you get your order". |
| Q8 | Ship order: split the server part (this plan + #111's server change) to `main` before the 0.5.0 app stack? | **Yes, after CP2**, so staging (and later production) take orders at once; the app follows with 0.5.0 or an EAS Update. |
| Q9 | Is it OK that production shops without delivery options start taking orders as soon as release-production runs? | **Yes,** but tell those sellers first (faraja-styles at least). I can't list them without production access; the owner can, or I add a read-only count to the support digest if you want. |

**About "split the server part":** that task hasn't been started in this session. Nothing is half-done or merged, so nothing is paused. The split is folded into this plan as Q8, because it would carry the ordering rule this plan changes.
