// Help guides (20b-help), approved by the owner in Step 85 with fixes. The same text lives in
// docs/help-guides.md for review; guides.test.ts fails if the two differ. **Bold** marks a
// button or screen name. `{deleteAccountUrl}` is filled in from config (decision #77 / #78).

export interface GuideSection {
  heading: string;
  body: string;
}

export interface Guide {
  id: string;
  title: string;
  summary: string;
  /** Matched by search, never shown. */
  keywords: string[];
  sections: GuideSection[];
}

export const GUIDES: Guide[] = [
  {
    id: 'getting-paid',
    title: 'Getting paid',
    summary: 'Buyers pay you directly on M-Pesa. oda never touches your money.',
    keywords: [
      'M-Pesa',
      'till',
      'pochi',
      'paybill',
      'payment',
      'confirm',
      'refund',
      'money',
      'pay on delivery',
    ],
    sections: [
      {
        heading: 'How buyers pay you',
        body: 'Add your M-Pesa account in **More → Payments**: a Buy Goods Till, Pochi la Biashara or a Paybill. At checkout, buyers see your number and the name on the account, and pay you straight from their phone.',
      },
      {
        heading: 'Before delivery or on delivery',
        body: 'In **Payments → When buyers pay**, choose **Before delivery** (the buyer pays when ordering), **On delivery** (the buyer pays you or your rider when the order arrives), or both. At least one stays on.',
      },
      {
        heading: 'When a buyer says they paid',
        body: 'The order shows **Says paid** with their M-Pesa code. Check your M-Pesa messages for that code and amount, then tap **Confirm payment**. If the money isn’t there, tap **Payment isn’t in my M-Pesa**, then **I can’t find this payment**: the order goes back to waiting for payment, and the buyer’s order page tells them to check their code and send it again.',
      },
      {
        heading: 'Unpaid orders',
        body: 'If a buyer doesn’t pay within 48 hours, the order is cancelled for you. The buyer gets an email, if they gave an email at checkout.',
      },
      {
        heading: 'Refunds',
        body: 'If you cancel an order the buyer already paid for, it shows **Refund due** in your orders. Send the money back on M-Pesa yourself, then tap **Mark refund sent**. The buyer gets an email, if they gave an email at checkout.',
      },
    ],
  },
  {
    id: 'delivery',
    title: 'Delivery and pickup',
    summary: 'Set where you deliver, what it costs, and whether buyers can pick up.',
    keywords: [
      'delivery',
      'rider',
      'parcel',
      'pickup',
      'fee',
      'free delivery',
      'area',
      'location',
      'send',
      'sent',
    ],
    sections: [
      {
        heading: 'Delivery areas',
        body: 'In **More → Delivery**, tap **Add delivery area** for each place you deliver to, with its fee, how it travels (rider or parcel) and how long it takes (for example "Same day"). Buyers pick one at checkout and the fee is added to their total.',
      },
      {
        heading: 'Pickup',
        body: 'Turn on **Buyers can pick up** and say where and when. Pickup is free for the buyer.',
      },
      {
        heading: 'Free delivery',
        body: 'Set an amount, for example KSh 5,000, and turn on **Free delivery over the amount** in the areas it applies to. Orders over that amount get free delivery in those areas.',
      },
      {
        heading: 'Delivery is optional',
        body: 'Without delivery areas or pickup, buyers can still order and you arrange delivery with them on WhatsApp. Their order shows *Arranged with buyer*. Tap **I’ll arrange delivery with buyers** on the Delivery screen to tick it off your checklist.',
      },
      {
        heading: 'Sending an order',
        body: 'When it’s on its way, open the order and tap **Mark as sent** (**Mark ready for pickup** for pickup orders). For an order arranged with the buyer, choose **By rider**, **By parcel** or **Buyer collects**. When the buyer has it, tap **Mark as delivered**. The buyer gets an email each time, if they gave an email at checkout.',
      },
    ],
  },
  {
    id: 'orders',
    title: 'Your orders',
    summary: 'Accept, confirm, send and deliver orders, or add one you took on WhatsApp.',
    keywords: [
      'order',
      'accept',
      'confirm',
      'cancel',
      'sent',
      'delivered',
      'new order',
      'manual order',
      'WhatsApp',
      'customer',
    ],
    sections: [
      {
        heading: 'New orders',
        body: 'You get a notification for each new order. Pay-on-delivery orders wait for you to tap **Accept order**. Pay-now orders wait for the buyer to pay, then for you to **Confirm payment**.',
      },
      {
        heading: 'The order steps',
        body: 'Accepted or paid → **Mark as sent** → **Mark as delivered**. The **Orders** tab groups what needs you first.',
      },
      {
        heading: 'Talk to the buyer',
        body: 'Every order has a WhatsApp button with a ready message (the order number and link). Edit it before you send.',
      },
      {
        heading: 'Cancelling',
        body: 'Open the order, tap ⋮ then **Cancel order**, and pick a reason. The buyer gets an email, if they gave an email at checkout. If they had paid, you refund them (see *Getting paid*).',
      },
      {
        heading: 'Orders from DMs and calls',
        body: 'Tap **New order** on the Orders tab to record an order you took on WhatsApp, TikTok or in person. It counts in your sales and customers like any other.',
      },
    ],
  },
  {
    id: 'reviews',
    title: 'Reviews',
    summary:
      'Buyers rate delivered orders. You can reply, or report a review that breaks the rules.',
    keywords: ['review', 'rating', 'stars', 'reply', 'report', 'photo', 'feedback from buyers'],
    sections: [
      {
        heading: 'Who can review',
        body: 'Only a buyer whose order was delivered, once per order. They can edit their review for 7 days. Orders you added yourself can’t be reviewed.',
      },
      {
        heading: 'Replying',
        body: 'Open **More → Reviews**, tap **Reply** under a review, write it and tap **Save reply**. Buyers see it under the review on your product page.',
      },
      {
        heading: 'Reporting',
        body: 'If a review is fake, rude or shares private details, tap ⋮ then **Report review**. The review stays visible while the oda team checks it, but its photos are hidden at once. Its stars still count until the team decides.',
      },
      {
        heading: 'Your rating',
        body: 'Your shop shows the average stars and the number of reviews. Each product shows its own rating from the items buyers rated.',
      },
    ],
  },
  {
    id: 'sharing',
    title: 'Sharing your shop',
    summary: 'Share your link everywhere you sell, and see which places bring orders.',
    keywords: [
      'share',
      'link',
      'TikTok',
      'Instagram',
      'WhatsApp',
      'Status',
      'Facebook',
      'caption',
      'image',
      'insights',
    ],
    sections: [
      {
        heading: 'Your link',
        body: 'Your shop lives at your link (see **More → Shop profile**). Put it in your TikTok and Instagram bio, your WhatsApp Status and your chats.',
      },
      {
        heading: 'Share from oda',
        body: 'On the **Shop** tab, tap **Share**. Pick where you’ll post and a ready image: **New in** (your newest product) or **Collection** (your whole shop). Pick a caption in English or Swahili (**Try another** gives a different one), then tap **Share to …**. The caption is copied, so paste it with your post. Links shared from oda are tagged, so **Insights** can show where your orders come from.',
      },
      {
        heading: 'Changed your link?',
        body: 'Your old link keeps working and sends buyers to the new one.',
      },
    ],
  },
  {
    id: 'account',
    title: 'Your account and getting help',
    summary:
      'Your details, password, pausing your shop, deleting your account, and how to reach us.',
    keywords: [
      'account',
      'password',
      'email',
      'phone',
      'pause',
      'break',
      'holiday',
      'delete',
      'close shop',
      'support',
      'help',
      'contact',
    ],
    sections: [
      {
        heading: 'Your details and password',
        body: 'In **More → Settings** you can change your name, your recovery phone and your password. Your email can’t be changed yet. If you sign in with Google, **Set a password** emails you a link to add one.',
      },
      {
        heading: 'Taking a break',
        body: 'Turn on **Pause my shop**. Buyers can still look around but can’t order until you turn it off.',
      },
      {
        heading: 'Deleting your account',
        body: '**Settings → Delete account**, then type DELETE. Your shop closes at once. Your products, orders, customers and photos are removed after 30 days. This can’t be undone. You can also do this on oda’s website at {deleteAccountUrl}.',
      },
      {
        heading: 'Getting help',
        body: 'Email {supportEmail}. To suggest an idea or report a problem, use **Settings → Share feedback** (you can add a screenshot). We read every message.',
      },
    ],
  },
];
