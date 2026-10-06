# Help guides (M8b)

The guides in the app's Help screen (20b-help). Drafted in M8b (decision #74 f), **approved by
the owner in Step 85** with fixes (decision #78). The in-app copy is
`apps/seller/src/help/guides.ts`; its test fails if it differs from this file, so change both
together. **Bold** marks a button or screen name. In the app, `{deleteAccountUrl}` becomes
oda's own delete page from config (e.g. `oda-eta.vercel.app/delete-account`) and
`{supportEmail}` the support email from config (decision #77). The keywords are only used by
search.

---

## 1. Getting paid

**Summary:** Buyers pay you directly on M-Pesa. oda never touches your money.
**Keywords:** M-Pesa, till, pochi, paybill, payment, confirm, refund, money, pay on delivery

**How buyers pay you.** Add your M-Pesa account in **More → Payments**: a Buy Goods Till, Pochi la Biashara or a Paybill. At checkout, buyers see your number and the name on the account, and pay you straight from their phone.

**Before delivery or on delivery.** In **Payments → When buyers pay**, choose **Before delivery** (the buyer pays when ordering), **On delivery** (the buyer pays you or your rider when the order arrives), or both. At least one stays on.

**When a buyer says they paid.** The order shows **Says paid** with their M-Pesa code. Check your M-Pesa messages for that code and amount, then tap **Confirm payment**. If the money isn’t there, tap **Payment isn’t in my M-Pesa**, then **I can’t find this payment**: the order goes back to waiting for payment, and the buyer’s order page tells them to check their code and send it again.

**Unpaid orders.** If a buyer doesn’t pay within 48 hours, the order is cancelled for you. The buyer gets an email, if they gave an email at checkout.

**Refunds.** If you cancel an order the buyer already paid for, it shows **Refund due** in your orders. Send the money back on M-Pesa yourself, then tap **Mark refund sent**. The buyer gets an email, if they gave an email at checkout.

---

## 2. Delivery and pickup

**Summary:** Set where you deliver, what it costs, and whether buyers can pick up.
**Keywords:** delivery, rider, parcel, pickup, fee, free delivery, area, location, send, sent

**Delivery areas.** In **More → Delivery**, tap **Add delivery area** for each place you deliver to, with its fee, how it travels (rider or parcel) and how long it takes (for example "Same day"). Buyers pick one at checkout and the fee is added to their total.

**Pickup.** Turn on **Buyers can pick up** and say where and when. Pickup is free for the buyer.

**Free delivery.** Set an amount, for example KSh 5,000, and turn on **Free delivery over the amount** in the areas it applies to. Orders over that amount get free delivery in those areas.

**You need one way to deliver.** Without a delivery area or pickup, your shop shows "Not taking orders yet".

**Sending an order.** When it’s on its way, open the order and tap **Mark as sent** (**Mark ready for pickup** for pickup orders). When the buyer has it, tap **Mark as delivered**. The buyer gets an email each time, if they gave an email at checkout.

---

## 3. Your orders

**Summary:** Accept, confirm, send and deliver orders, or add one you took on WhatsApp.
**Keywords:** order, accept, confirm, cancel, sent, delivered, new order, manual order, WhatsApp, customer

**New orders.** You get a notification for each new order. Pay-on-delivery orders wait for you to tap **Accept order**. Pay-now orders wait for the buyer to pay, then for you to **Confirm payment**.

**The order steps.** Accepted or paid → **Mark as sent** → **Mark as delivered**. The **Orders** tab groups what needs you first.

**Talk to the buyer.** Every order has a WhatsApp button with a ready message (the order number and link). Edit it before you send.

**Cancelling.** Open the order, tap ⋮ then **Cancel order**, and pick a reason. The buyer gets an email, if they gave an email at checkout. If they had paid, you refund them (see *Getting paid*).

**Orders from DMs and calls.** Tap **New order** on the Orders tab to record an order you took on WhatsApp, TikTok or in person. It counts in your sales and customers like any other.

---

## 4. Reviews

**Summary:** Buyers rate delivered orders. You can reply, or report a review that breaks the rules.
**Keywords:** review, rating, stars, reply, report, photo, feedback from buyers

**Who can review.** Only a buyer whose order was delivered, once per order. They can edit their review for 7 days. Orders you added yourself can’t be reviewed.

**Replying.** Open **More → Reviews**, tap **Reply** under a review, write it and tap **Save reply**. Buyers see it under the review on your product page.

**Reporting.** If a review is fake, rude or shares private details, tap ⋮ then **Report review**. The review stays visible while the oda team checks it, but its photos are hidden at once. Its stars still count until the team decides.

**Your rating.** Your shop shows the average stars and the number of reviews. Each product shows its own rating from the items buyers rated.

---

## 5. Sharing your shop

**Summary:** Share your link everywhere you sell, and see which places bring orders.
**Keywords:** share, link, TikTok, Instagram, WhatsApp, Status, Facebook, caption, image, insights

**Your link.** Your shop lives at your link (see **More → Shop profile**). Put it in your TikTok and Instagram bio, your WhatsApp Status and your chats.

**Share from oda.** On the **Shop** tab, tap **Share**. Pick where you’ll post and a ready image: **New in** (your newest product) or **Collection** (your whole shop). Pick a caption in English or Swahili (**Try another** gives a different one), then tap **Share to …**. The caption is copied, so paste it with your post. Links shared from oda are tagged, so **Insights** can show where your orders come from.

**Changed your link?.** Your old link keeps working and sends buyers to the new one.

---

## 6. Your account and getting help

**Summary:** Your details, password, pausing your shop, deleting your account, and how to reach us.
**Keywords:** account, password, email, phone, pause, break, holiday, delete, close shop, support, help, contact

**Your details and password.** In **More → Settings** you can change your name, your recovery phone and your password. Your email can’t be changed yet.

**Taking a break.** Turn on **Pause my shop**. Buyers can still look around but can’t order until you turn it off.

**Deleting your account.** **Settings → Delete account**, then type DELETE. Your shop closes at once. Your products, orders, customers and photos are removed after 30 days. This can’t be undone. You can also do this on oda’s website at {deleteAccountUrl}.

**Getting help.** Email {supportEmail}. To suggest an idea or report a problem, use **Settings → Share feedback** (you can add a screenshot). We read every message.
