import 'server-only';
import { colors } from '@oda/ui-tokens';
import {
  BUYER_CANCEL_LABELS,
  clock24,
  shortDate,
  formatKePhone,
  formatKes,
  OTP_TTL_SECONDS,
  RESET_LINK_TTL_SECONDS,
  type CancelReason,
  type EmailTemplate,
  type PaymentStatus,
  type SentMethod,
} from '@oda/shared';
import type { Email } from './transport';

// Seller emails: 04 (verification code) and 06 (reset password), docs/design-changes.md.
// Buyer emails (M5, decision #61 f): the receipt and "you cancelled", with the order link; M6
// adds the seller-triggered updates (confirmed, accepted, sent, delivered, cancelled by the
// seller, expired, refunded).
// Plain HTML tables with inline styles, which every mail app renders. Poppins where the
// mail app allows web fonts, Arial otherwise. Brand always lowercase "oda". No social icons
// and no "Contact us" until M8 (decision #43).

const FONT = "Poppins, 'Segoe UI', Roboto, Arial, sans-serif";

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function wordmark(size: number): string {
  return `<span style="font-family:${FONT};font-size:${size}px;font-weight:700;letter-spacing:-1px;color:${colors.primary};">oda</span><span style="font-family:${FONT};font-size:${size}px;font-weight:700;color:${colors.greenBright};">.</span>`;
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${colors.background};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.background};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;font-family:${FONT};color:${colors.text};">
<tr><td align="center" style="padding-bottom:32px;">${wordmark(40)}</td></tr>
${body}
<tr><td style="padding-top:32px;font-size:15px;line-height:24px;color:${colors.text};">Thank you,<br>The oda team</td></tr>
<tr><td style="padding:48px 0 24px;"><div style="height:1px;line-height:1px;font-size:1px;background:${colors.border};">&nbsp;</div></td></tr>
<tr><td style="font-size:13px;line-height:20px;color:${colors.textSecondary};">${wordmark(20)}<br>Your free shop link · Nairobi, Kenya</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const ignoreLine = "If you didn't request this, you can safely ignore this email.";

/** 04: the 6-digit code that verifies a new seller's email. */
export function verificationCodeEmail(to: string, code: string): Email {
  const minutes = Math.round(OTP_TTL_SECONDS / 60);
  const html = layout(
    'Your oda code',
    `<tr><td align="center" style="font-size:26px;line-height:34px;font-weight:700;padding-bottom:24px;">Here's your one-time verification code</td></tr>
<tr><td align="center" style="padding-bottom:16px;">
<div style="display:inline-block;background:${colors.surfaceMuted};border-radius:16px;padding:16px 32px;font-size:34px;line-height:42px;font-weight:700;letter-spacing:8px;color:${colors.text};">${escapeHtml(code)}</div>
</td></tr>
<tr><td align="center" style="font-size:15px;line-height:24px;color:${colors.textSecondary};padding-bottom:24px;">Enter it in the oda app. It works for ${minutes} minutes.</td></tr>
<tr><td style="font-size:15px;line-height:24px;color:${colors.textSecondary};">${ignoreLine}</td></tr>`,
  );
  const text = `Here's your one-time verification code: ${code}

Enter it in the oda app. It works for ${minutes} minutes.

${ignoreLine}

Thank you,
The oda team`;
  // The code in the subject shows in the phone's notification, so sellers can copy it there.
  return { kind: 'verification-code', to, subject: `${code} is your oda code`, html, text };
}

/** 06: the link to the web reset page (07). */
export function resetPasswordEmail(to: string, url: string): Email {
  const hours = Math.round(RESET_LINK_TTL_SECONDS / 3600);
  const safeUrl = escapeHtml(url);
  const html = layout(
    'Reset your oda password',
    `<tr><td align="center" style="font-size:26px;line-height:34px;font-weight:700;padding-bottom:24px;">Reset your password</td></tr>
<tr><td style="font-size:15px;line-height:24px;color:${colors.textSecondary};padding-bottom:24px;">We received a request to reset your password. Follow the link below to choose a new one. It works for ${hours} hour.</td></tr>
<tr><td align="center" style="padding-bottom:24px;">
<a href="${safeUrl}" style="display:inline-block;background:${colors.primary};color:${colors.textOnPrimary};text-decoration:none;font-weight:600;font-size:16px;line-height:24px;padding:14px 32px;border-radius:999px;">Reset password</a>
</td></tr>
<tr><td style="font-size:13px;line-height:20px;color:${colors.textSecondary};padding-bottom:24px;">Or open this link: <a href="${safeUrl}" style="color:${colors.primary};word-break:break-all;">${safeUrl}</a></td></tr>
<tr><td style="font-size:15px;line-height:24px;color:${colors.textSecondary};">${ignoreLine}</td></tr>`,
  );
  const text = `Reset your password

We received a request to reset your password. Open this link to choose a new one (it works for ${hours} hour):
${url}

${ignoreLine}

Thank you,
The oda team`;
  return { kind: 'reset-link', to, subject: 'Reset your oda password', html, text };
}

/** 21-change-password: tells the seller their password changed (M8a, decision #74 i). */
export function passwordChangedEmail(to: string): Email {
  const line =
    "Your oda password was just changed. If this wasn't you, reset your password from the oda app's sign-in screen (Forgot password) and email support@mugu-labs.com.";
  const html = layout(
    'Your oda password was changed',
    `<tr><td align="center" style="font-size:26px;line-height:34px;font-weight:700;padding-bottom:24px;">Your password was changed</td></tr>
<tr><td style="font-size:15px;line-height:24px;color:${colors.textSecondary};">${escapeHtml(line)}</td></tr>`,
  );
  const text = `Your password was changed

${line}

Thank you,
The oda team`;
  return { kind: 'password-changed', to, subject: 'Your oda password was changed', html, text };
}

/** The web /delete-account confirm link (decision #72 c): 1 hour, single use. */
export function deleteAccountLinkEmail(to: string, url: string): Email {
  const safeUrl = escapeHtml(url);
  const what =
    'Someone asked to delete the oda account for this email. If it was you, open the link below to confirm. It works for 1 hour. Your shop closes at once, and your products, orders, customers and photos are removed after 30 days.';
  const notYou = "If you didn't ask for this, ignore this email: nothing changes.";
  const html = layout(
    'Delete your oda account',
    `<tr><td align="center" style="font-size:26px;line-height:34px;font-weight:700;padding-bottom:24px;">Delete your oda account?</td></tr>
<tr><td style="font-size:15px;line-height:24px;color:${colors.textSecondary};padding-bottom:24px;">${escapeHtml(what)}</td></tr>
<tr><td align="center" style="padding-bottom:24px;">
<a href="${safeUrl}" style="display:inline-block;background:${colors.danger};color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;line-height:24px;padding:14px 32px;border-radius:999px;">Review and confirm</a>
</td></tr>
<tr><td style="font-size:13px;line-height:20px;color:${colors.textSecondary};padding-bottom:24px;">Or open this link: <a href="${safeUrl}" style="color:${colors.primary};word-break:break-all;">${safeUrl}</a></td></tr>
<tr><td style="font-size:15px;line-height:24px;color:${colors.textSecondary};">${escapeHtml(notYou)}</td></tr>`,
  );
  const text = `Delete your oda account?

${what}

${url}

${notYou}

Thank you,
The oda team`;
  return {
    kind: 'delete-account-link',
    to,
    subject: 'Confirm deleting your oda account',
    html,
    text,
  };
}

export interface DigestData {
  reports: {
    shopName: string;
    shopUrl: string;
    number: number;
    message: string;
    contactPhone: string | null;
    at: Date;
  }[];
  feedback: {
    shopName: string;
    shopUrl: string;
    kind: string;
    message: string;
    /** The shop's WhatsApp number when the seller asked for a reply there. */
    replyOnWhatsapp: string | null;
    screenshotUrl: string | null;
    hasScreenshot: boolean;
    at: Date;
  }[];
  reviews: {
    shopName: string;
    shopUrl: string;
    number: number;
    rating: number;
    displayName: string;
    text: string | null;
    reason: string | null;
    at: Date;
  }[];
}

const FEEDBACK_KIND_LABELS: Record<string, string> = {
  idea: 'An idea',
  broken: "Something's broken",
  confusing: "Something's confusing",
  love: 'I love something',
  problem: 'A problem',
};

/** The daily support digest to the oda team (decisions #72 b, #73 a): only sent with news. */
export function supportDigestEmail(to: string, data: DigestData): Email {
  const when = (at: Date) => `${shortDate(at)}, ${clock24(at)}`;
  const counts = [
    data.reports.length
      ? `${data.reports.length} buyer report${data.reports.length === 1 ? '' : 's'}`
      : '',
    data.feedback.length ? `${data.feedback.length} feedback` : '',
    data.reviews.length
      ? `${data.reviews.length} reported review${data.reviews.length === 1 ? '' : 's'}`
      : '',
  ].filter(Boolean);
  const subject = `oda support: ${counts.join(', ')}`;

  type Item = { title: string; lines: [string, string][]; link?: { label: string; url: string } };
  const all: { heading: string; items: Item[] }[] = [
    {
      heading: 'Buyer reports',
      items: data.reports.map((x) => ({
        title: `${x.shopName} · order #${x.number}`,
        lines: [
          ['When', when(x.at)],
          ['Message', x.message],
          ['Buyer phone', x.contactPhone ?? 'not given'],
          ['Shop', x.shopUrl],
        ],
      })),
    },
    {
      heading: 'Seller feedback',
      items: data.feedback.map((x) => ({
        title: `${x.shopName} · ${FEEDBACK_KIND_LABELS[x.kind] ?? x.kind}`,
        lines: [
          ['When', when(x.at)],
          ['Message', x.message],
          ['Reply on WhatsApp', x.replyOnWhatsapp ?? 'no'],
          ['Shop', x.shopUrl],
          ...(x.hasScreenshot && !x.screenshotUrl
            ? [['Screenshot', 'stored, but no link could be made'] as [string, string]]
            : []),
        ],
        link: x.screenshotUrl
          ? { label: 'Open the screenshot (link works for 7 days)', url: x.screenshotUrl }
          : undefined,
      })),
    },
    {
      heading: 'Reported reviews',
      items: data.reviews.map((x) => ({
        title: `${x.shopName} · order #${x.number} · ${'★'.repeat(x.rating)}`,
        lines: [
          ['Reported', when(x.at)],
          ['By buyer', x.displayName],
          ['Review', x.text ?? '(stars only)'],
          ['Seller says', x.reason ?? '(no reason given)'],
          ['To remove it', 'GitHub → Actions → review-remove'],
        ],
      })),
    },
  ];
  const sections = all.filter((section) => section.items.length > 0);

  const htmlItem = (item: Item) =>
    `<tr><td style="padding:12px 0;border-top:1px solid ${colors.border};">
<div style="font-size:15px;line-height:22px;font-weight:700;">${escapeHtml(item.title)}</div>
${item.lines
  .map(
    ([label, value]) =>
      `<div style="font-size:14px;line-height:21px;"><span style="color:${colors.textSecondary};">${escapeHtml(label)}:</span> ${escapeHtml(value)}</div>`,
  )
  .join('\n')}
${item.link ? `<div style="font-size:14px;line-height:21px;"><a href="${escapeHtml(item.link.url)}" style="color:${colors.primary};">${escapeHtml(item.link.label)}</a></div>` : ''}
</td></tr>`;
  const html = layout(
    subject,
    `<tr><td style="font-size:22px;line-height:30px;font-weight:700;padding-bottom:8px;">Support digest</td></tr>
<tr><td style="font-size:15px;line-height:24px;color:${colors.textSecondary};padding-bottom:16px;">New since the last digest: ${escapeHtml(counts.join(', '))}. Reply to sellers and buyers outside oda (email or WhatsApp).</td></tr>
${sections
  .map(
    (section) =>
      `<tr><td style="font-size:17px;line-height:26px;font-weight:700;padding-top:16px;">${escapeHtml(section.heading)}</td></tr>
${section.items.map(htmlItem).join('\n')}`,
  )
  .join('\n')}`,
  );
  const text = [
    'Support digest',
    `New since the last digest: ${counts.join(', ')}.`,
    ...sections.flatMap((section) => [
      '',
      section.heading.toUpperCase(),
      ...section.items.flatMap((item) => [
        '',
        item.title,
        ...item.lines.map(([label, value]) => `${label}: ${value}`),
        ...(item.link ? [`${item.link.label}: ${item.link.url}`] : []),
      ]),
    ]),
  ].join('\n');
  return { kind: 'support-digest', to, subject, html, text };
}

export interface OrderEmailData {
  to: string;
  shopName: string;
  number: number;
  buyerName: string;
  paymentMethod: 'pay_before' | 'pay_on_delivery';
  fulfilment: 'delivery' | 'pickup';
  deliveryAreaName: string | null;
  items: {
    name: string;
    size: string | null;
    colour: string | null;
    qty: number;
    unitPrice: number;
  }[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  /** The buyer's order page, /o/{token}. */
  link: string;
  /** The review page, /o/{token}/review; null for manual orders (decision #73 i). */
  reviewLink?: string | null;
}

function itemRows(o: OrderEmailData): { html: string; text: string } {
  const label = (i: OrderEmailData['items'][number]) =>
    [i.name, [i.colour, i.size ? `Size ${i.size}` : null].filter(Boolean).join(' · ')]
      .filter(Boolean)
      .join(' — ');
  const row = (left: string, right: string, strong = false) =>
    `<tr><td style="padding:6px 0;font-size:15px;line-height:22px;${strong ? 'font-weight:700;' : `color:${colors.textSecondary};`}">${left}</td><td align="right" style="padding:6px 0;font-size:15px;line-height:22px;white-space:nowrap;${strong ? 'font-weight:700;' : ''}">${right}</td></tr>`;
  const delivery =
    o.fulfilment === 'pickup'
      ? 'Pickup'
      : `Delivery${o.deliveryAreaName ? ` · ${escapeHtml(o.deliveryAreaName)}` : ''}`;
  const html = `<tr><td style="padding-bottom:24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${o.items.map((i) => row(`${escapeHtml(label(i))} × ${i.qty}`, formatKes(i.unitPrice * i.qty))).join('\n')}
${row(delivery, o.deliveryFee === 0 ? 'Free' : formatKes(o.deliveryFee))}
${row('Total', formatKes(o.total), true)}
</table></td></tr>`;
  const text = [
    ...o.items.map((i) => `${label(i)} × ${i.qty}: ${formatKes(i.unitPrice * i.qty)}`),
    `${o.fulfilment === 'pickup' ? 'Pickup' : `Delivery${o.deliveryAreaName ? ` (${o.deliveryAreaName})` : ''}`}: ${o.deliveryFee === 0 ? 'Free' : formatKes(o.deliveryFee)}`,
    `Total: ${formatKes(o.total)}`,
  ].join('\n');
  return { html, text };
}

function orderButton(link: string, label: string): string {
  const safe = escapeHtml(link);
  return `<tr><td align="center" style="padding-bottom:24px;">
<a href="${safe}" style="display:inline-block;background:${colors.primary};color:${colors.textOnPrimary};text-decoration:none;font-weight:600;font-size:16px;line-height:24px;padding:14px 32px;border-radius:999px;">${escapeHtml(label)}</a>
</td></tr>
<tr><td style="font-size:13px;line-height:20px;color:${colors.textSecondary};padding-bottom:8px;">Or open this link: <a href="${safe}" style="color:${colors.primary};word-break:break-all;">${safe}</a></td></tr>`;
}

/** The buyer's receipt when the order is placed (order-lifecycle.md: "email receipt"). */
export function orderReceiptEmail(o: OrderEmailData): Email {
  const shop = escapeHtml(o.shopName);
  const nextStep =
    o.paymentMethod === 'pay_on_delivery'
      ? `${o.shopName} will accept your order and get it to you. You pay ${formatKes(o.total)} on delivery.`
      : `Pay ${formatKes(o.total)} to ${o.shopName} on M-Pesa. The exact steps are on your order page.`;
  const items = itemRows(o);
  const html = layout(
    `Your order #${o.number} from ${o.shopName}`,
    `<tr><td style="font-size:26px;line-height:34px;font-weight:700;padding-bottom:8px;">Order placed!</td></tr>
<tr><td style="font-size:15px;line-height:24px;color:${colors.textSecondary};padding-bottom:24px;">Hi ${escapeHtml(o.buyerName)}, thanks for ordering from ${shop}. This is your order <strong style="color:${colors.text};">#${o.number}</strong>.</td></tr>
${items.html}
<tr><td style="font-size:15px;line-height:24px;padding-bottom:24px;">${escapeHtml(nextStep)}</td></tr>
${orderButton(o.link, 'Track your order')}
<tr><td style="font-size:13px;line-height:20px;color:${colors.textSecondary};">Keep this email: the link is how you track your order. You pay ${shop} directly; oda never holds your money.</td></tr>`,
  );
  const text = `Order placed!

Hi ${o.buyerName}, thanks for ordering from ${o.shopName}. This is your order #${o.number}.

${items.text}

${nextStep}

Track your order: ${o.link}

Keep this email: the link is how you track your order. You pay ${o.shopName} directly; oda never holds your money.

Thank you,
The oda team`;
  return {
    kind: 'order-receipt',
    to: o.to,
    subject: `Your order #${o.number} from ${o.shopName}`,
    html,
    text,
  };
}

/** "You cancelled" (buyer cancel). `claimed`: they had said they paid, so a refund may follow. */
export function orderCancelledEmail(o: OrderEmailData & { claimed: boolean }): Email {
  const shop = escapeHtml(o.shopName);
  const money = o.claimed
    ? `You told ${o.shopName} you had paid. If the money reached them, ${o.shopName} will send it back to your M-Pesa. Message them if you have questions.`
    : 'You haven’t been charged for this order.';
  const html = layout(
    `You cancelled order #${o.number}`,
    `<tr><td style="font-size:26px;line-height:34px;font-weight:700;padding-bottom:8px;">Order cancelled</td></tr>
<tr><td style="font-size:15px;line-height:24px;color:${colors.textSecondary};padding-bottom:24px;">Hi ${escapeHtml(o.buyerName)}, you cancelled your order <strong style="color:${colors.text};">#${o.number}</strong> from ${shop} (${formatKes(o.total)}).</td></tr>
<tr><td style="font-size:15px;line-height:24px;padding-bottom:24px;">${escapeHtml(money)}</td></tr>
${orderButton(o.link, 'See your order')}`,
  );
  const text = `Order cancelled

Hi ${o.buyerName}, you cancelled your order #${o.number} from ${o.shopName} (${formatKes(o.total)}).

${money}

See your order: ${o.link}

Thank you,
The oda team`;
  return {
    kind: 'order-cancelled',
    to: o.to,
    subject: `You cancelled order #${o.number} from ${o.shopName}`,
    html,
    text,
  };
}

/** What an order update says beyond the order itself. */
export interface OrderUpdateFacts {
  paymentStatus: PaymentStatus;
  sentMethod: SentMethod | null;
  riderPhone: string | null;
  pickupLocation: string | null;
  pickupHours: string | null;
  cancelReason: CancelReason | null;
}

type UpdateTemplate = Exclude<EmailTemplate, 'receipt' | 'cancelled'> | 'seller_cancelled';

const UPDATE_KINDS: Record<UpdateTemplate, Email['kind']> = {
  payment_confirmed: 'order-confirmed',
  accepted: 'order-accepted',
  sent: 'order-sent',
  delivered: 'order-delivered',
  seller_cancelled: 'order-cancelled',
  expired: 'order-expired',
  refunded: 'order-refunded',
};

/**
 * The seller-triggered updates (order-lifecycle.md "email" side effects). Each says what
 * happened, what's next, and links to the order page; the delivered email links to the review
 * page (M7) for orders that can be reviewed.
 */
export function orderUpdateEmail(
  template: UpdateTemplate,
  o: OrderEmailData,
  f: OrderUpdateFacts,
): Email {
  const total = formatKes(o.total);
  const n = `#${o.number}`;
  let heading: string;
  let subject: string;
  let lines: string[];
  let button = 'See your order';
  let link = o.link;
  switch (template) {
    case 'payment_confirmed':
      heading = 'Payment confirmed';
      subject = `${o.shopName} confirmed your payment for order ${n}`;
      lines = [
        `${o.shopName} confirmed your payment of ${total} for order ${n}.`,
        `They'll get your order ready and let you know when it's on the way.`,
      ];
      button = 'Track your order';
      break;
    case 'accepted':
      heading = 'Order accepted';
      subject = `${o.shopName} accepted your order ${n}`;
      lines = [`${o.shopName} accepted your order ${n}.`, `You pay ${total} when it reaches you.`];
      button = 'Track your order';
      break;
    case 'sent':
      if (f.sentMethod === 'pickup') {
        heading = 'Ready for pickup';
        subject = `Your order ${n} from ${o.shopName} is ready for pickup`;
        const where = [f.pickupLocation, f.pickupHours].filter(Boolean).join(', ');
        lines = [`Your order ${n} is ready for pickup${where ? ` at ${where}` : ''}.`];
      } else {
        heading = 'Your order is on its way';
        subject = `Your order ${n} from ${o.shopName} is on its way`;
        lines = [
          f.sentMethod === 'parcel'
            ? `${o.shopName} sent your order ${n} by parcel service.`
            : `${o.shopName} sent your order ${n} with a rider.`,
          ...(f.riderPhone ? [`Rider's number: ${formatKePhone(f.riderPhone)}.`] : []),
        ];
      }
      if (o.paymentMethod === 'pay_on_delivery' && f.paymentStatus !== 'paid') {
        lines.push(`Have ${total} ready to pay on delivery.`);
      }
      button = 'Track your order';
      break;
    case 'delivered':
      heading = 'Delivered';
      subject = `Your order ${n} from ${o.shopName} was delivered`;
      lines = [`Your order ${n} from ${o.shopName} was delivered. We hope you love it!`];
      if (o.reviewLink) {
        lines.push(`How was it? Your review helps other buyers and ${o.shopName}.`);
        button = 'Rate your order';
        link = o.reviewLink;
      }
      break;
    case 'seller_cancelled': {
      heading = 'Order cancelled';
      subject = `${o.shopName} cancelled your order ${n}`;
      const reason = f.cancelReason ? BUYER_CANCEL_LABELS[f.cancelReason] : null;
      lines = [
        `${o.shopName} cancelled your order ${n} (${total}).${reason ? ` Reason: ${reason}.` : ''}`,
      ];
      lines.push(
        f.paymentStatus === 'refund_due'
          ? `${o.shopName} will send your ${total} back to your M-Pesa. Message them if you have questions.`
          : 'You haven’t been charged for this order.',
      );
      break;
    }
    case 'expired':
      heading = 'Order expired';
      subject = `Your order ${n} from ${o.shopName} expired`;
      lines = [
        `Your order ${n} from ${o.shopName} was cancelled because it wasn't paid within 48 hours.`,
        'You can order again from the shop any time.',
      ];
      break;
    case 'refunded':
      heading = 'Refund sent';
      subject = `${o.shopName} sent your refund for order ${n}`;
      lines = [
        `${o.shopName} says they sent ${total} back to your M-Pesa for order ${n}.`,
        'Check your M-Pesa messages. If it hasn’t arrived, message the shop.',
      ];
      break;
  }
  const html = layout(
    subject,
    `<tr><td style="font-size:26px;line-height:34px;font-weight:700;padding-bottom:8px;">${escapeHtml(heading)}</td></tr>
<tr><td style="font-size:15px;line-height:24px;color:${colors.textSecondary};padding-bottom:16px;">Hi ${escapeHtml(o.buyerName)},</td></tr>
${lines.map((l) => `<tr><td style="font-size:15px;line-height:24px;padding-bottom:16px;">${escapeHtml(l)}</td></tr>`).join('\n')}
${orderButton(link, button)}`,
  );
  const text = `${heading}

Hi ${o.buyerName},

${lines.join('\n\n')}

${button}: ${link}

Thank you,
The oda team`;
  return { kind: UPDATE_KINDS[template], to: o.to, subject, html, text };
}
