# M7 plan: reviews and ratings (approved)

Proposed in owner Step 77, **approved in Step 79** with the owner's answers (decision #73). Acceptance criteria stay in `milestones.md` (M7): aggregates update correctly (tests) and a review can't be posted on an undelivered order. Screens: web **5d-rate-order**, **05c** (the "Rate your order" card), **02** (reviews on the product page), **01** (rating in the shop header); app **20b-reviews**. Spec §6.7, data-model → Reviews.

## What already exists
- Tables `reviews` (one per order: `order_id unique`, `shop_id`, `buyer_display_name`, `rating 1–5`, `tags`, `seller_reply`, `replied_at`, `editable_until`) and `review_items` (per item: `rating` or null, `text`, `photo_path`), same-shop foreign keys (decision #34).
- **Rating aggregates by trigger** (migration 0002): `shops.rating_avg/rating_count` and `products.rating_avg/rating_count` follow inserts, updates and deletes. M7 adds the tests the acceptance criterion asks for.
- `notifications.type` already has `new_review` (+ `review_id`); push sending (M6) works for any push type, so a new review reaches the seller's phone without a native build.
- The order page shows "How was your order?" with an inactive **Reviews open soon** (M5); the delivered email and WhatsApp message link to the order page until reviews exist (#66 d, #66 e).
- Upload pipeline (decision #52): presigned PUTs, byte checks, location data stripped on the device. **Not yet:** uploads authorised by an order token (only seller sessions today), and resizing in the browser.

## Checkpoints

**CP1 · Review server**
- `GET /api/o/:token/review`: what the form needs (order items with names, options and thumbnails; the existing review if any; whether it can still be edited).
- `POST /api/o/:token/review` (create) and `PUT /api/o/:token/review` (edit until `editable_until` = created + **7 days**). Only for **delivered, buyer-placed** orders (409 `not_delivered` / `review_not_allowed` for manual orders), one per order (the unique key; a second POST is 409). Whitelist: overall rating 1–5 (required); tags from the four (As described, Well packed, Fast delivery, Friendly seller); per item: rating 1–5 or none, text ≤ 500 characters (links and phone numbers stripped on the server), at most 1 photo key. Items must be this order's own. `buyer_display_name` is made on the server from the order's buyer name ("Wanjiku Mwangi" → "Wanjiku M."), never sent by the browser. Same Origin check and per-IP lookup limit as the other buyer endpoints (#62); 10 review writes a day per order.
- **Review photos:** `POST /api/o/:token/uploads` presigns `reviews/{orderId}/…` keys for that order only (JPEG/PNG/WebP, 5 MB, same byte checks incl. location data, checked again on submit); replaced photos are deleted; uploads never submitted are left for M8's purge of unreferenced keys (decision #73 k).
- On create: a `new_review` notification row + push ("★★★★★ from Wanjiku M. · #1042"), in the same transaction / `afterOrderChange`-style hook. On edit: no new push.
- **Public reads:** the shop header gets `rating_avg`/`rating_count` (shown from 1 review) next to the delivered count; `GET` product reviews (newest first, 20 a page): name, date, overall stars, that item's rating/text/photo, tags, seller reply. Never the buyer's phone, email or order number.
- **Seller API:** `GET /api/reviews?tab=all|needs_reply|low` (low = overall ≤ 3) with the summary (average, count, 5→1 histogram), `PUT /api/reviews/:id/reply` (≤ 500 characters; edit or clear allowed), `POST /api/reviews/:id/report` (optional reason; hides the photos publicly; 10 a day per shop).
- **Removal:** `POST /api/ops/reviews/remove` (Bearer `OPS_SECRET`, 404 otherwise) + `review-remove.yml` (workflow_dispatch: review id, reason; actor = the GitHub user): audit row, delete, averages recomputed, photos deleted.
- Authorization tests: another shop's review is 404; a buyer token can't touch another order's review.
- Tests: aggregates on create/edit/cascade (shop and product, items without a rating don't count for the product), undelivered/cancelled → refused, the 7-day window (backdated), one per order under a race, photo keys only from this order's prefix, manual orders refused, links/phones stripped, reported reviews hide photos publicly, removal (audit row, averages, photos, 404 without the secret).

**CP2 · Buyer web**
- `/o/{token}/review` (5d): shop header, big stars with the label (Not great / Could be better / Okay / Good / Loved it!), tag chips, per-item cards (stars, text, Add photo → resized **in the browser** to ~1600 px via canvas (re-encoded as JPEG, which drops location data; one size, as `review_items.photo_path` holds one key); the server checks again), "Submit review", "Shows as Wanjiku M. · Verified buyer". Edit mode within 7 days; after that a read-only "Your review".
- Order page: "Reviews open soon" becomes **Rate your order** (delivered, buyer-placed; manual orders show no prompt and no "Rate your order" step), then **Edit your review** / **Your review**; the timeline's "Rate your order" step goes green when done.
- Shop home (01): ★ 4.8 (38) in the header line. Product page (02): rating under the name (links to the list) and the reviews list with photos and seller replies.
- The delivered email's link and the delivered WhatsApp message now point at `/o/{token}/review` (manual orders keep the order link).
- Playwright: delivered order → review with a photo → shows on the product page with the average; undelivered order has no review link and the API refuses; edit within 7 days.
- → 🛑 **Review stop A** (buyer on the phone's browser, see the test plan).

**CP3 · Seller app (20b-reviews)**
- More → **Reviews** (and the More row shows "4.8 ★ · 38"): tabs All / Needs reply / Low ratings with counts, the summary card (average, stars, histogram), review cards (buyer name, stars, relative date, item texts with product chips, photos, "No reply yet" + Reply / "Your reply" with Edit). Reply sheet with the text box; saving updates the card.
- A `new_review` push or notification opens the review (Reviews screen scrolled to it). Offline: last loaded list, read-only.
- The note under the list: "Buyers get a review link when you mark an order as delivered" (design-changes wording: oda doesn't send it; your WhatsApp message and their email do).
- **EAS Update only** (runtime 0.3.0): no native change.
- → 🛑 **Review stop B** (phone, end to end).

**CP4 · Wrap-up → M7 gate:** forbidden cases in tests, design comparison (5d, 05c, 02, 01, 20b-reviews), accessibility (star buttons labelled "Rate 4 out of 5", 44 px targets), `progress.md`, tag `m7-done`.

## Owner's answers (Step 79, decision #73)
1. **Moderation:** the seller can **report** a review (app, CP3): it stays visible (stars, text, counts in the averages) but its **photos are hidden at once**; reports are rate-limited and go into the M8 support digest. Review text is cleaned on the server (links and phone numbers removed). **Removing** a review is a manual GitHub Actions workflow (`review-remove.yml` → `POST /api/ops/reviews/remove`, Bearer `OPS_SECRET`, `ops_events` audit row), built in M7.
2. Display name "Wanjiku M.", built on the server from the order: yes.
3. Low ratings = 1–3★: yes.
4. Only rated items count toward a product's average: yes.
5. Push "★★★★★ from Wanjiku M. · #1042" + notification row; no push on edits: yes.
6. **Manual orders: no reviews in v1.** Only buyer-placed orders can be reviewed; a manual order's page shows no review prompt.

## Data model
Migration **0005** (expand only, decision #73 d): `reviews.reported_at`, `reviews.report_reason`; table `ops_events` (audit of ops workflows). Everything else exists.

## What's needed outside the code
- `OPS_SECRET`: generated and piped into GitHub Actions secrets and Vercel (Production + Preview, Sensitive) without printing; verified by name.

## Phone test plan (draft)
**Review stop A** (buyer on a phone browser; your shop has a delivered order with your email):
1. Open the delivered email → "See your order" → order page shows **Rate your order**.
2. Rate 5 stars → "Loved it!"; tick two tags; rate one item 4 stars with text and a photo from the gallery; leave the other unrated → Submit → back on the order page with "Edit your review"; the timeline's last step is done.
3. Shop home shows ★ 5.0 (1); the reviewed product's page shows the rating and the review with the photo and "Wanjiku M. · Verified buyer"; the unrated product shows no rating.
4. Edit the review (change to 4 stars) → the averages change.
5. An order that isn't delivered: no review link; opening `/o/{token}/review` shows "You can rate your order once it's delivered".
6. Two reviews on two orders of the same product → the product average is right (e.g. 4 and 5 → 4.5).

**Review stop B** (seller on the Redmi):
7. A buyer submits a review → push "★★★★★ from …" within 10 s; tap → Reviews with that review.
8. Reviews screen: the summary (average, histogram), tabs All / Needs reply / Low ratings with the right counts.
9. Reply → the card shows "Your reply"; the product page on the web shows the reply under the review.
10. Mark another order delivered with WhatsApp on → the message links to the review page; the delivered email too.
11. Offline → the saved reviews list with the offline bar.
