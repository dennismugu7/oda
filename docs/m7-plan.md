# M7 plan: reviews and ratings (proposed, not approved)

Proposed in owner Step 77. **Not approved yet; no M7 work started.** Acceptance criteria stay in `milestones.md` (M7): aggregates update correctly (tests) and a review can't be posted on an undelivered order. Screens: web **5d-rate-order**, **05c** (the "Rate your order" card), **02** (reviews on the product page), **01** (rating in the shop header); app **20b-reviews**. Spec §6.7, data-model → Reviews.

## What already exists
- Tables `reviews` (one per order: `order_id unique`, `shop_id`, `buyer_display_name`, `rating 1–5`, `tags`, `seller_reply`, `replied_at`, `editable_until`) and `review_items` (per item: `rating` or null, `text`, `photo_path`), same-shop foreign keys (decision #34).
- **Rating aggregates by trigger** (migration 0002): `shops.rating_avg/rating_count` and `products.rating_avg/rating_count` follow inserts, updates and deletes. M7 adds the tests the acceptance criterion asks for.
- `notifications.type` already has `new_review` (+ `review_id`); push sending (M6) works for any push type, so a new review reaches the seller's phone without a native build.
- The order page shows "How was your order?" with an inactive **Reviews open soon** (M5); the delivered email and WhatsApp message link to the order page until reviews exist (#66 d, #66 e).
- Upload pipeline (decision #52): presigned PUTs, byte checks, location data stripped on the device. **Not yet:** uploads authorised by an order token (only seller sessions today), and resizing in the browser.

## Checkpoints

**CP1 · Review server**
- `GET /api/o/:token/review`: what the form needs (order items with names, options and thumbnails; the existing review if any; whether it can still be edited).
- `POST /api/o/:token/review` (create) and `PUT /api/o/:token/review` (edit until `editable_until` = created + **7 days**). Only for **delivered** orders (409 otherwise), one per order (the unique key; a second POST is 409). Whitelist: overall rating 1–5 (required); tags from the four (As described, Well packed, Fast delivery, Friendly seller); per item: rating 1–5 or none, text ≤ 500 characters (links stripped, like buyer names), at most 1 photo key. Items must be this order's own. `buyer_display_name` is made on the server from the order's buyer name ("Wanjiku Mwangi" → "Wanjiku M."), never sent by the browser. Same Origin check and per-IP lookup limit as the other buyer endpoints (#62); 10 review writes a day per order.
- **Review photos:** `POST /api/o/:token/uploads` presigns `reviews/{orderId}/…` keys for that order only (JPEG/PNG/WebP, 5 MB, same byte checks incl. location data); unused photos go to `storage_deletions`.
- On create: a `new_review` notification row + push ("★★★★★ from Wanjiku M. · #1042"), in the same transaction / `afterOrderChange`-style hook. On edit: no new push.
- **Public reads:** the shop header gets `rating_avg`/`rating_count` (shown from 1 review) next to the delivered count; `GET` product reviews (newest first, 20 a page): name, date, overall stars, that item's rating/text/photo, tags, seller reply. Never the buyer's phone, email or order number.
- **Seller API:** `GET /api/reviews?tab=all|needs_reply|low` (low = overall ≤ 3) with the summary (average, count, 5→1 histogram), `PUT /api/reviews/:id/reply` (≤ 500 characters; edit or clear allowed). Authorization tests: another shop's review is 404; a buyer token can't touch another order's review.
- Tests: aggregates on create/edit/cascade (shop and product, items without a rating don't count for the product), undelivered/cancelled → refused, the 7-day window (backdated), one per order under a race, photo keys only from this order's prefix.

**CP2 · Buyer web**
- `/o/{token}/review` (5d): shop header, big stars with the label (Not great / Could be better / Okay / Good / Loved it!), tag chips, per-item cards (stars, text, Add photo → resized **in the browser** to ~1600 px + ~400 px thumbnail via canvas, which drops location data; the server checks again), "Submit review", "Shows as Wanjiku M. · Verified buyer". Edit mode within 7 days; after that a read-only "Your review".
- Order page: "Reviews open soon" becomes **Rate your order** (delivered), then **Edit your review** / **Your review**; the timeline's "Rate your order" step goes green when done.
- Shop home (01): ★ 4.8 (38) in the header line. Product page (02): rating under the name (links to the list) and the reviews list with photos and seller replies.
- The delivered email's link and the delivered WhatsApp message now point at `/o/{token}/review`.
- Playwright: delivered order → review with a photo → shows on the product page with the average; undelivered order has no review link and the API refuses; edit within 7 days.
- → 🛑 **Review stop A** (buyer on the phone's browser, see the test plan).

**CP3 · Seller app (20b-reviews)**
- More → **Reviews** (and the More row shows "4.8 ★ · 38"): tabs All / Needs reply / Low ratings with counts, the summary card (average, stars, histogram), review cards (buyer name, stars, relative date, item texts with product chips, photos, "No reply yet" + Reply / "Your reply" with Edit). Reply sheet with the text box; saving updates the card.
- A `new_review` push or notification opens the review (Reviews screen scrolled to it). Offline: last loaded list, read-only.
- The note under the list: "Buyers get a review link when you mark an order as delivered" (design-changes wording: oda doesn't send it; your WhatsApp message and their email do).
- **EAS Update only** (runtime 0.3.0): no native change.
- → 🛑 **Review stop B** (phone, end to end).

**CP4 · Wrap-up → M7 gate:** forbidden cases in tests, design comparison (5d, 05c, 02, 01, 20b-reviews), accessibility (star buttons labelled "Rate 4 out of 5", 44 px targets), `progress.md`, tag `m7-done`.

## Questions for the owner (flags)
1. **No moderation exists** (M9 removed): a review and its photos are public at once. Options: (a) keep it so for v1; (b) the seller can **report** a review → it's included in the daily support digest (M8) and the team removes it in the database if needed; (c) the seller can **hide** a review (still counted? not counted?). I suggest **(b)**, with the review staying visible until removed.
2. **Display name:** "Wanjiku M." (first name + last initial) as in 5d's "Wanjiku K." — OK? Buyers with one name show just that name.
3. **Low ratings** tab = overall 1–3 stars?
4. **Product rating** counts only items the buyer rated (unrated items don't pull the average down)?
5. **Push for a new review:** yes (text above), and in the notifications list.
6. Reviews from **manual orders** (the seller's own DMs): allowed once delivered, like any order? (I suggest yes: they're real buyers with the link.)

## Data model
**No schema change planned** (tables, aggregates and the `new_review` type exist). If you choose a "report" or "hide" option in question 1, that needs one nullable column (`reported_at` or `hidden_at`) — I'll record it as a decision first.

## What I need from you
- Approval of this plan and answers to the six questions. Nothing external: storage, email and push are already set up.

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
