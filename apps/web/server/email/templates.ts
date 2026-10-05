import 'server-only';
import { colors } from '@oda/ui-tokens';
import { formatKes, OTP_TTL_SECONDS, RESET_LINK_TTL_SECONDS } from '@oda/shared';
import type { Email } from './transport';

// Seller emails: 04 (verification code) and 06 (reset password), docs/design-changes.md.
// Buyer emails (M5, decision #61 f): the receipt and "you cancelled", with the order link.
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
