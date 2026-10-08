# M10 CP6 · Full regression script (staging, Redmi)

The phone part of M10's full regression (`docs/m10-plan.md` → CP6): every seller-app and buyer-web
flow from M2 to M10, on **staging** (https://oda-eta.vercel.app) with the Redmi on build 0.3.1 and
EAS Update `01a11b05`. Three sittings of about 20 minutes. Send the results after each sitting
(step numbers for anything that fails, a screenshot if it helps); Claude fixes what breaks before
the next sitting.

**Test shops.** All seller steps use throwaway shops, never Demo Duka (it has no seller login) and
never your main shop:
- **Shop A** "Reg Test Shop", made in Sitting 1. Used for orders and reviews, then deleted on the web in Sitting 3.
- **Shop B**, made quickly in Sitting 3 and deleted in the app.

**Emails.** Sign up with plus addresses of your own Gmail: `yourname+oda-a@gmail.com` (Shop A) and
`yourname+oda-b@gmail.com` (Shop B). They land in your normal inbox.

**Never send real money.** Shop A uses the fake Till `000000`; Demo Duka's Till is fake too.

**Claude's automated part** (done before or between sittings, results in `docs/progress.md`):
- `pnpm check:all`: unit, authorization and UI tests, plus 26 Playwright buyer flows.
- The jobs: cron-expire-orders, cron-purge (dry run, then real), cron-digest, backup-restore-check.
- The ops tools: staging-backdate-order, shop-suspend, review-remove, staging-backdate-deletion.

---

## Sitting 1 · Sign-up, onboarding, catalogue, the shop on the web (~20 min)

**Setup before you start**
- The Redmi on Wi-Fi or data. The oda app closed and reopened twice, so More → Help (bottom line) shows **update 01a11b05**.
- Your Gmail open in the phone's browser (or the Gmail app), for the codes.
- You know your main account's password (you sign out of it at step 1.1; Sitting 3 ends with signing back in).

### 1A · Sign-up and email code (M2)

| # | Do this | Expected |
|---|---------|----------|
| 1.1 | App: More → Settings → **Log out** → **Log out**. | The welcome screen: "Your free shop link", the shop card animation, **Create new shop** and **Sign in**. |
| 1.2 | **Create new shop**. Email `yourname+oda-a@gmail.com`, a new password of 8+ characters, **Create my account**. | "Confirm your email" and "We sent a 6-digit code to …". |
| 1.3 | Type a wrong code, e.g. `000000`, then **Verify**. | "That code isn't right. Check the email and try again." |
| 1.4 | Tap **Resend**. | "We sent you a new code." An email arrives within a minute or so (check spam). |
| 1.5 | Enter the newest code, then **Verify**. | Onboarding opens on "Step 1 of 6". |

### 1B · Onboarding, with a resume (M2)

| # | Do this | Expected |
|---|---------|----------|
| 1.6 | Step 1: **Clothes & fashion**, then **Next**. Step 2: **WhatsApp Status** and **TikTok**, then **Next**. | Each step moves on; the header shows "Step 2 of 6", then "Step 3 of 6". |
| 1.7 | Step 3: shop name `Reg Test Shop`, WhatsApp `712 345 678`. Wait for the link check. | "reg-test-shop is yours" (or "That link is taken." with suggestions: pick one and write it down). |
| 1.8 | Tap **Edit**, set the link to `demo-duka`. | "That link is taken." with up to 3 suggestions. Put your link back (step 1.7's) and tap **Next**. |
| 1.9 | Step 4: **swipe oda away** from recent apps, then open oda again. | It opens on **Step 4 of 6** ("Add your first product"), not the welcome screen. |
| 1.10 | Step 4: tap **Add product** with nothing filled in. | "Add a photo of your product. Buyers want to see it." |
| 1.11 | Add a photo (**Take a photo** or **Choose from gallery**), name `Test dress`, price `1500`, size **M**, then **Add product**. | "Uploading photos…", then Step 5. |
| 1.12 | Step 5: **Buy Goods Till**, Till number `000000`, name `REG TEST ONLY`, then **Continue**. | "Your shop is live" with your link, a **Copy** button and the "Finish setting up" card. |
| 1.13 | Tap **Copy**, then **Go to my shop**. | "Copied". Home opens: "Good …", your shop name, "No orders yet", and a "Finish your shop" card. |

### 1C · Delivery and catalogue (M3, M6)

| # | Do this | Expected |
|---|---------|----------|
| 1.14 | More → **Delivery**. | The warning "Buyers can't order yet. Add a delivery area or turn on pickup." |
| 1.15 | Add delivery area: `Kilimani`, fee `200`, **By rider**, time `Same day`, then **Add area**. Turn on **Buyers can pick up**, with place `Yaya Centre` and hours `Mon–Sat 9–6`. | The warning is gone; the area and pickup are listed. |
| 1.16 | Shop tab → **Categories**: add `Dresses`, then `Tops`. On **Tops**, open its actions and choose **Move up**. | Tops is now above Dresses. Notice: "Empty categories stay hidden from buyers until you add a product." |
| 1.17 | Centre **Add product** button: add 2 photos, name `Test top`, price `900`, was price `1200`, category **Tops**, **+ Size** S and M, **+ Colour** one colour, then **Add product**. | It appears on the Shop tab with its photo. |
| 1.18 | Try was price `800` (lower than the price) on any product, then save. | "The was-price must be higher than the price." Fix it or **Leave** → **Leave**. |
| 1.19 | Open **Test dress**: set category **Dresses**, add a second photo, then on the second photo **Make it the cover**. Then **Save changes**. | Saved; the Shop tab shows the new cover. |
| 1.20 | Long-press **Test top** → **Sold out**. Add a third product `Hidden item` (price `500`, any photo), then long-press → **Hidden**. | Badges "Sold out" and "Hidden"; the **Sold out** and **Hidden** filter chips show them. |
| 1.21 | Add one more product `Delete me` (any photo, `100`), open it → ⋮ → **Delete product**, then tap **Undo** on the notice. Delete it again and let the notice go. | Undo brings it back; the second delete sticks. |

### 1D · Preview, share, and the shop on the web (M4, M8b)

| # | Do this | Expected |
|---|---------|----------|
| 1.22 | Shop tab → the **eye** icon. | Your shop opens in the in-app browser, in orange: Test dress and Test top (Sold out), no Hidden item. |
| 1.23 | Shop tab → **Share**. Pick **WhatsApp**, then **New in**, **SW** caption, **Try another**, **Copy caption**. | The image preview shows your latest product; the caption is in Swahili and changes; "Orders from this post will show as "via WhatsApp"". |
| 1.24 | In the phone's **browser** (Chrome), open `https://oda-eta.vercel.app/<your link>`. | The shop: "Delivery from KSh 200 · Pickup in …", categories **All / Tops / Dresses** (Tops first), 2 products, Test top marked **Sold out** with KSh 1,200 crossed out. |
| 1.25 | Open **Test top**. | No **Add to cart** (it's sold out). Go back. |
| 1.26 | Search the shop for `dress`, then open **Filters and sort** → Sort **Price: low to high** → **Show results**. | "1 product for "dress"" (Test dress), and sorting works. |
| 1.27 | Open **Test dress** → size **M** → **Add to cart · KSh 1,500** → **View cart →**. | "Your cart" with 1 item, Subtotal KSh 1,500, Delivery "Calculated at checkout". Leave it there (Sitting 2 continues). |
| 1.28 | Browser: open `https://oda-eta.vercel.app/demo-duka`. Tap the ♡ on two products, then reload. | The "Demo shop: don't send money" banner; 12 products; the hearts stay filled after the reload. |
| 1.29 | Browser: `https://oda-eta.vercel.app/not-a-real-shop-xyz`. | "This page isn't here", with **Go to oda**. |
| 1.30 | Browser: `https://oda-eta.vercel.app/`, then the **Privacy** and **Terms** links at the bottom. | "Turn your posts into orders."; both pages open (Privacy says it's a placeholder until launch). |

### 1E · Forgot password and reset (M2)

| # | Do this | Expected |
|---|---------|----------|
| 1.31 | App: More → Settings → **Log out**. On the welcome screen, **Sign in** → wrong password → **Continue**. | "Incorrect email or password. Try again." |
| 1.32 | **Forgot password?** → your `+oda-a` email → **Send reset link**. | "Check your email". The email "Reset your oda password" arrives. |
| 1.33 | In the email, tap **Reset password**. Enter two different passwords, then **Reset password**. | The browser shows "Choose a new password", then "The passwords don't match." |
| 1.34 | Enter the same new password twice → **Reset password**. | "Password changed!" |
| 1.35 | Tap the same email link again. | "This link has expired" (or "…already used"). |
| 1.36 | App: **Sign in** with the new password. | Home of Reg Test Shop. Stay signed in to Shop A. |

**Send back:** pass/fail per step number and your Shop A link (the part after `oda-eta.vercel.app/`).

---

## Sitting 2 · Orders end to end (~20 min)

**Setup before you start**
- Claude has re-run **demo-seed-staging**, so the Demo Duka sample links are fresh. They are in the job summary; Claude also sends them in the chat.
- The app is signed in to Shop A, with notifications allowed.
- Chrome's cart from step 1.27 is still there.

### 2A · Pay now, with the push (M5, M6)

| # | Do this | Expected |
|---|---------|----------|
| 2.1 | Chrome: cart → **Checkout**. Name `Buyer One`, phone `712 000 001`, tick **I use WhatsApp on this number**, **Kilimani**, address `Argwings Kodhek Rd`, **Pay now with M-Pesa** → **Place order · KSh 1,700**. Press the phone's lock button straight away. | Within about 10 s, a push "New order" for Shop A. In Chrome: "Pay KSh 1,700 to Reg Test Shop", Till `000000`, "Check you see REG TEST ONLY…". |
| 2.2 | Paste `hello` in "Paste your M-Pesa message or the code". | "We can't see a code yet. It looks like SJK4X7PQ2M." |
| 2.3 | Paste `SRG0TEST01 Confirmed. Ksh1,700.00 sent to REG TEST ONLY` → **I've paid**. | The order page: "Order placed!", with the timeline "Now: Waiting for Reg Test Shop to confirm your payment". A push "says paid". |
| 2.4 | App: Home → To do → **To confirm**. | The order shows "Says paid" with **Confirm**. |
| 2.5 | Open the order → **Payment isn't in my M-Pesa** → **I can't find this payment**. | The status changes to "Check payment". In Chrome, after a reload: "Reg Test Shop couldn't find your payment", with the code box again. |
| 2.6 | Chrome: paste `SRG0TEST02 Confirmed. Ksh1,700.00 sent to REG TEST ONLY` → **I've paid**. App: open the order → **Confirm payment** → tick "The amount and code match my M-Pesa message" → **Confirm payment**. | "Paid · KSh 1,700 confirmed". Chrome (reload): "Payment confirmed". |
| 2.7 | App: **Mark as sent** → **Rider**, rider's phone `712 000 002` → **Mark as sent**. | "On its way". Chrome: "Sent out". |
| 2.8 | App: **Mark as delivered** → **Mark as delivered**. | "Delivered". Chrome: "Delivered", and a "How was your order?" rate card. **Don't rate yet** (Sitting 3). |
| 2.9 | App: the order's call and WhatsApp icons. | The phone dialler opens with the buyer's number; WhatsApp opens with "Hi Buyer One, about your order #…". Go back without sending. |

### 2B · Pay on delivery, pickup, buyer cancel (M5, M6)

| # | Do this | Expected |
|---|---------|----------|
| 2.10 | Chrome: Shop A → Test dress → size M → cart → **Checkout**: name `Buyer Two`, phone `712 000 003`, **Pickup**, **Pay on delivery** → **Place order**. | "Order placed!", "Now: Waiting for Reg Test Shop to accept". A push arrives. |
| 2.11 | App: Home → To do → **New** → **Accept**. | "Accepted · Buyer Two pays KSh 1,500 on delivery". Chrome: "Accepted by Reg Test Shop". |
| 2.12 | App: **Mark as sent** → **Buyer picks up** → **Mark ready for pickup**. Then **Mark as delivered** → tick "I've collected KSh 1,500" → **Mark as delivered**. | "Ready for pickup", then "Delivered". Chrome shows each step. |
| 2.13 | Chrome: another order (any product, Kilimani, pay on delivery). On its page: **Cancel** → **Yes, cancel it**. | "Order cancelled", "You cancelled it". The app shows the order as Cancelled (a push or notification). |

### 2C · Seller cancel and refund; manual order (M6)

| # | Do this | Expected |
|---|---------|----------|
| 2.14 | Chrome: another pay-now order, then paste `SRG0TEST03 Confirmed. Ksh…` → **I've paid**. App: open it → ⋮ → **Cancel order** → "Yes, I got it" → reason **Out of stock**, note `private note` → **Cancel order**. | The order shows a refund to send: "Send KSh … back to 07…". Chrome: "Order cancelled", reason "Out of stock", and **no** "private note". |
| 2.15 | App: **Mark refund sent**. | "Refund sent"; the status chip is **Refunded**. |
| 2.16 | App: Orders → **New order**: buyer `Walk-in Buyer`, `712 000 004`, **Add product** Test dress M, **Pickup**, **Not paid yet** → **Create order**. | "Order #… created" with **Send on WhatsApp**, **Copy link** and **View order**. |
| 2.17 | **Copy link**, open it in Chrome. | The buyer's pay page for that order (Till 000000). |
| 2.18 | App: open that order → **I got the money (mark as paid)** → **Mark as paid**. | "Paid · …". |
| 2.19 | App: Orders tabs **To do / All / Done**, then search `Buyer Two`, then search `999999`. | The lists change by tab; the search finds Buyer Two's order; "No orders found". |
| 2.20 | App: the bell on Home. | "Notifications" lists the new orders, payments and cancellations. **Mark all read** → "All caught up". |

### 2D · Demo Duka's states and expiry (M5, M6)

| # | Do this | Expected |
|---|---------|----------|
| 2.21 | Chrome: the **Payment not found** sample link. | The demo banner and "Demo Duka couldn't find your payment". |
| 2.22 | The **Cancelled by the seller** link. | "Order cancelled", "Out of stock", and **no** "Private seller note". |
| 2.23 | The **Expired** link. | "Order expired", "Not paid within 48 hours". |
| 2.24 | The **Ready for pickup** link, then the **Sent with a rider** link. | "Ready for pickup" (pickup point and hours); "Sent out". |
| 2.25 | Chrome: a new pay-now order on Shop A; don't pay. Tell Claude its order number. Claude runs **staging-backdate-order**, then **cron-expire-orders**. Reload the page. | "Order expired". The app shows it as Cancelled. |

### 2E · Offline (M10)

| # | Do this | Expected |
|---|---------|----------|
| 2.26 | Airplane mode on. App: Orders, an order you've opened, then **New order**. | Saved data shows; **New order** shows an error with **Try again**, never an endless spinner. |
| 2.27 | Airplane mode off → **Try again**. | It loads. |

**Send back:** pass/fail per step, and anything that looked wrong.

---

## Sitting 3 · Reviews, grow and manage, settings, suspend, delete (~20 min)

**Setup before you start**
- The app is signed in to Shop A. Chrome still has Shop A's delivered order page from 2.8 (or find it in the app: the order → ⋮ → **Copy order link**).
- A photo in the gallery for the review.

### 3A · Reviews (M7)

| # | Do this | Expected |
|---|---------|----------|
| 3.1 | Chrome: the **Delivered** Demo Duka link → **Rate your order**. | The review form; it can be filled in (Demo Duka's delivered order). Go back without submitting. |
| 3.2 | Chrome: Shop A's delivered order from 2.8 → **Rate your order**: 2 stars (outlined), tags **Well packed**, item text `Too small`, **Add photo** → **Submit review**. | "Thanks for your review"; "Edit your review" is offered. |
| 3.3 | **Edit your review** → 4 stars → **Save changes**. | Saved; "Reviews can be changed for 7 days…". |
| 3.4 | Chrome: the order page of the cancelled order from 2.13. | No rate card: reviews aren't open for this order. |
| 3.5 | App: More → **Reviews**. | The review: 4 outlined stars, "Too small", and the photo. |
| 3.6 | ⋮ → **Reply** → `Asante! We'll fix the sizes.` → **Save reply**. | "Edit your reply" now. Chrome: the product page of Test dress shows the review and "Reply from Reg Test Shop". |
| 3.7 | ⋮ → **Report review** → `test report` → **Report review**. | "Reported to oda"; the photo is hidden from buyers (product page). |
| 3.8 | Tell Claude; Claude runs **review-remove** for this review. Reload the product page. | The review is gone from the product page. |

### 3B · Insights, customers, Help, Rate (M8b)

| # | Do this | Expected |
|---|---------|----------|
| 3.9 | More → **Insights** → **Today**, **This week**, **This month**. | Orders and Avg. order count Sitting 2's paid or accepted orders (not the cancelled or unpaid ones); Shop visits above 0; TOP PRODUCTS shows Test dress. |
| 3.10 | More → **Customers** → **All**, search `Buyer`. | Buyer One, Buyer Two and Walk-in Buyer (buyers with a paid or accepted order); the WhatsApp button opens "Hi Buyer One, ". |
| 3.11 | More → **Help and support**: search `refund`, open a guide. | Matching guides; the guide opens. The bottom line reads "App version 0.3.1 · update 01a11b05". |
| 3.12 | Settings → **Rate the app** → 2 stars. Then reopen it and choose 5 stars. | 2 stars: "Tell us what to improve". 5 stars: "Rate on Play Store". Close with **Done**. |

### 3C · Settings (M8a)

| # | Do this | Expected |
|---|---------|----------|
| 3.13 | Settings → **Your details**: first name `Reg`, last name `Tester` → **Save changes**. | Saved; Home says "Good …, Reg". |
| 3.14 | Settings → **Change your password**: wrong current password, then the right one, new password ×2 → **Update password**. | The wrong one gives an error; the right one saves. |
| 3.15 | More → **Shop profile** → **Change link** → `reg-test-new-<today's date>` → **Use this link** → **Save changes**. Chrome: open the **old** link. | It redirects to the new link. |
| 3.16 | More → **Payments** → **Add another M-Pesa account** → **Paybill** `247247`, account **The order number**, name `REG TEST ONLY` → **Save account**; on it **Show this one at checkout**. Turn **On delivery** off. | Chrome: a new pay-now order shows Pay Bill `247247` with the order number as the account. Checkout offers no "Pay on delivery". Turn **On delivery** back on. |
| 3.17 | Settings → **Pause my shop** → **Pause shop**. Chrome: reload the shop. | "Reg Test Shop is taking a break. Back soon." **Add to cart** is replaced. Turn the pause off: ordering is back. |
| 3.18 | Settings → **Share feedback** → **Something's broken**, text `regression test`, **Screenshot** → **Add** → **Send feedback**. | "Thank you!". (Claude runs **cron-digest** afterwards: the feedback reaches support@mugu-labs.com.) |
| 3.19 | Chrome (any order page) → **Report a problem to oda** → `regression test report` → **Send to oda**. | "Thanks. oda will look into it…". |

### 3D · Suspend and unsuspend (M10)

| # | Do this | Expected |
|---|---------|----------|
| 3.20 | Tell Claude; Claude runs **shop-suspend** (suspend) on Shop A. Reopen the app; open Shop A in Chrome; open the unpaid order from 3.16. | App: "Your shop is suspended…" on Home and Shop; open orders still work. Chrome: "This page isn't here"; the order page says "This shop can't take payments right now. Don't send money." |
| 3.21 | Claude runs **shop-suspend** (unsuspend). Reload. | The banner is gone; the shop is back in Chrome. |

### 3E · Delete: web, then app (M8a)

| # | Do this | Expected |
|---|---------|----------|
| 3.22 | Chrome: `https://oda-eta.vercel.app/delete-account` → your `+oda-a` email → **Email me the confirm link**. | "Check your email". The email "Confirm deleting your oda account" arrives. |
| 3.23 | Tap **Review and confirm** → **Delete my account**. | "Your account is deleted". The shop link: "This page isn't here". Shop A's delivered order page: "This shop has closed…" with only "Report a problem". Reopen the app: Shop A is gone (it signs you out or shows an error with a way out, never a crash). |
| 3.24 | App: **Create new shop** with `yourname+oda-b@gmail.com`, code, steps 1–2 **Skip**, step 3 `Reg Test B`, step 4 one product, step 5 **Skip for now** → **Go to my shop**. | Home of Reg Test B. |
| 3.25 | Settings → **Delete account** → type `DELETE` → **Delete my account**. | "Your account is deleted"; the welcome screen. Its shop link in Chrome: "This page isn't here". |
| 3.26 | Claude runs **staging-backdate-deletion** for Shop A, then **cron-purge** (dry run, then real). | Claude reports: Shop A's data, photos and sign-in removed; Shop B (deleted today) untouched. |
| 3.27 | App: **Sign in** with your **main** account. | Your main shop is back as before. |

**Send back:** pass/fail per step. Then Claude records the results and asks for 🛑 review stop C.
