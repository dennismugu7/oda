// The buyer's order page, /o/{token} (spec §6.5–6.6; web 04b redesign, 05, 6, 05c with
// design-changes). A pay-now order waiting for payment shows the pay page; everything else
// shows the order status. What the buyer can do comes from the shared machine
// (buyerActions); a cancelled order shows its reason as a label, never the seller's note
// (decision #38 b); a deleted shop keeps the link with only "Report a problem" (#38 c).
// Delivered buyer-placed orders get the "Rate your order" card (M7); manual orders can't be
// reviewed and show no prompt (decision #73 i).
// Opened only by the random token; noindex, no referrer, lookups rate-limited per IP.
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  BUYER_CANCEL_LABELS,
  buyerActions,
  buyerTimeline,
  canReviewOrder,
  formatKePhone,
  formatKes,
  paymentsBlocked,
  SUSPENDED_PAY_MESSAGE,
  type CancelReason,
} from '@oda/shared';
import {
  CancelCard,
  PayPanel,
  ReportProblem,
  type PayAccount,
} from '@/components/order/OrderActions';
import { DemoBanner } from '@/components/store/DemoBanner';
import { orderDayTime, orderTime } from '@/lib/time';
import { openOrder, orderShop } from '@/server/checkout';
import { getDb } from '@/server/db';
import { isDemoShop } from '@/server/demo';
import { NotFoundError } from '@/server/errors';
import { orderTokenRepo } from '@/server/repos/order-token';
import { buyerReviewRepo } from '@/server/repos/reviews';
import { publicUrl } from '@/server/uploads';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your order · oda',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

function Check({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const db = getDb();
  let ctx;
  try {
    ctx = await openOrder(db, (await params).token, await headers());
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const [order, shop, reviewStatus] = await Promise.all([
    orderTokenRepo(db, ctx).view(),
    orderShop(db, ctx),
    buyerReviewRepo(db, ctx).status(),
  ]);
  const reviewedAt = reviewStatus?.reviewedAt ?? null;
  /** Buyer-placed orders can be reviewed once delivered; manual ones never (decision #73 i). */
  const reviewable = ctx.order.source !== 'manual';
  const canReview = canReviewOrder(ctx.order);
  const bookmark = reviewable
    ? 'Bookmark this page. It’s how you track your order and leave a review.'
    : 'Bookmark this page. It’s how you track your order.';
  const shopName = order.shop?.name ?? 'the shop';
  const actions = buyerActions(ctx.order, shop);
  const account = order.paymentAccount as PayAccount | null;
  const itemCount = order.items.reduce((n, i) => n + i.qty, 0);
  const summary = `${shopName} · ${itemCount} ${itemCount === 1 ? 'item' : 'items'} · ${formatKes(order.total)}`;
  const demo = order.shop && isDemoShop(order.shop.slug);
  const whatsapp =
    order.shop && !shop.closed
      ? `https://wa.me/${order.shop.whatsappPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
          `Hi ${shopName}, about my order #${order.number} on oda.`,
        )}`
      : null;

  const closedBanner = shop.closed ? (
    <p
      role="status"
      className="mt-4 rounded-lg bg-warning-tint p-4 text-body text-warning-text-strong"
    >
      <strong>This shop has closed.</strong> Your order can’t change any more. If something is
      wrong, report it to oda below.
    </p>
  ) : null;

  // A suspended shop takes no payments (decision #83): no pay details, no "I've paid".
  const noPayments = paymentsBlocked(ctx.order, shop);
  const suspendedBanner = noPayments ? (
    <p
      role="alert"
      className="mt-4 rounded-lg bg-warning-tint p-4 text-body text-warning-text-strong"
    >
      <strong>{SUSPENDED_PAY_MESSAGE}</strong>
    </p>
  ) : null;

  const help = (
    <section aria-labelledby="help-title" className="mt-5 rounded-xl bg-background py-2">
      <h2 id="help-title" className="px-4 pt-3 pb-1 text-subtitle text-navy">
        Need help with this order?
      </h2>
      {whatsapp ? (
        <a
          href={whatsapp}
          className="flex min-h-16 items-center gap-3 border-b border-border px-4 py-3"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-green-tint text-green">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                d="M5 5h14v10H9l-4 4V5z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-body-strong text-navy">Message {shopName}</span>
            <span className="block text-small text-text-secondary">
              Questions about sizes, items or delivery
            </span>
          </span>
          <span aria-hidden="true" className="text-title text-navy">
            ›
          </span>
        </a>
      ) : null}
      <ReportProblem token={order.token} />
    </section>
  );

  // Pay page (04b redesign) -----------------------------------------------------------------
  if (actions.includes('submitCode') && account) {
    return (
      <>
        {demo ? <DemoBanner /> : null}
        <main className="mx-auto min-h-dvh max-w-md bg-surface px-4 pt-6 pb-16">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-body text-text-secondary">Order #{order.number}</p>
            <p className="truncate text-body text-text-secondary">{shopName}</p>
          </div>
          <h1 className="mt-1 text-headline text-navy">
            Pay {formatKes(order.total)} to {shopName}
          </h1>
          <p className="mt-1 text-body text-text-secondary">
            Your order is placed. Pay on M-Pesa, then tell {shopName} you’ve paid.
          </p>
          {order.paymentNotFound ? (
            <div
              role="alert"
              className="mt-4 rounded-xl bg-warning-tint p-4 text-body text-warning-text-strong"
            >
              <p className="font-semibold">{shopName} couldn’t find your payment</p>
              <p className="mt-1">
                Check your M-Pesa message and paste it again below, or message {shopName}.
              </p>
            </div>
          ) : null}
          <PayPanel
            token={order.token}
            total={order.total}
            shopName={shopName}
            account={account}
            canSwitch={actions.includes('switchToPod')}
            canCancel={actions.includes('cancel')}
          />
          {help}
          <p className="mt-5 flex gap-2 rounded-lg bg-peach p-4 text-body text-text-secondary">
            {bookmark}
          </p>
        </main>
      </>
    );
  }

  // Order status (05, 6, 05c) ---------------------------------------------------------------
  const cancelled = order.status === 'cancelled';
  const expired = cancelled && order.cancelReason === 'expired';
  const pickup = order.fulfilment === 'pickup';
  const timeline =
    cancelled || noPayments ? [] : buyerTimeline(order, shopName, { reviewable, reviewedAt });

  let hero: React.ReactNode = null;
  if (noPayments) {
    hero = null; // the suspended banner says it all
  } else if (
    order.status === 'awaiting_acceptance' ||
    order.status === 'payment_claimed' ||
    order.status === 'awaiting_payment'
  ) {
    hero = (
      <div className="mt-5 flex items-center gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center ml-2 rounded-pill bg-green text-text-on-primary ring-6 ring-green-tint">
          <Check />
        </span>
        <div>
          <h2 className="text-headline text-navy">Order placed!</h2>
          <p className="text-body text-text-secondary">
            Thanks, {firstName(order.buyerName)}.{' '}
            {order.status === 'payment_claimed'
              ? `${shopName} is checking your M-Pesa payment.`
              : order.paymentMethod === 'pay_on_delivery'
                ? `${shopName} will accept your order and get it to you. You pay ${formatKes(order.total)} ${pickup ? 'when you collect it' : 'on delivery'}.`
                : `${shopName} will be in touch.`}
          </p>
        </div>
      </div>
    );
  } else if (order.status === 'confirmed') {
    hero = (
      <div className="mt-5 rounded-xl bg-green-tint p-4">
        <h2 className="text-title text-navy">
          {order.paymentMethod === 'pay_on_delivery'
            ? `Accepted by ${shopName}`
            : 'Payment confirmed'}
        </h2>
        <p className="mt-1 text-body text-text-secondary">
          {shopName} is getting your order ready.
        </p>
      </div>
    );
  } else if (order.status === 'sent') {
    hero = (
      <div className="mt-5 rounded-xl bg-green-tint p-4">
        <h2 className="text-title text-navy">{pickup ? 'Ready for pickup' : 'Sent out'}</h2>
        <p className="mt-1 text-body text-text-secondary">
          {pickup
            ? [order.shop?.pickupLocation, order.shop?.pickupHours].filter(Boolean).join(' · ') ||
              `Collect it from ${shopName}.`
            : order.sentMethod === 'parcel'
              ? 'By parcel service.'
              : 'With a rider.'}
        </p>
        {order.riderPhone && !pickup ? (
          <a
            href={`tel:${order.riderPhone}`}
            className="mt-2 inline-flex min-h-11 items-center text-body-strong text-primary"
          >
            Call the rider · {formatKePhone(order.riderPhone)}
          </a>
        ) : null}
      </div>
    );
  } else if (order.status === 'delivered') {
    hero = (
      <>
        <div className="mt-5 flex items-center gap-4 rounded-xl bg-green-tint p-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-pill bg-green text-text-on-primary">
            <Check />
          </span>
          <div>
            <h2 className="text-headline text-navy">Delivered</h2>
            {order.deliveredAt ? (
              <p className="text-body text-text-secondary">{orderDayTime(order.deliveredAt)}</p>
            ) : null}
          </div>
        </div>
        {canReview && reviewedAt ? (
          <section aria-labelledby="rate-title" className="mt-5 rounded-xl bg-background p-5">
            <h2 id="rate-title" className="text-title text-navy">
              Thanks for your review
            </h2>
            <p className="mt-1 text-body text-text-secondary">
              It helps other buyers and {shopName}.
            </p>
            <Link
              href={`/o/${order.token}/review`}
              className="mt-4 flex h-12 items-center justify-center rounded-pill border border-primary text-button text-primary"
            >
              {reviewStatus?.editable ? 'Edit your review' : 'See your review'}
            </Link>
          </section>
        ) : canReview ? (
          <section
            aria-labelledby="rate-title"
            className="mt-5 rounded-xl border-2 border-primary p-5 text-center"
          >
            <h2 id="rate-title" className="text-title text-navy">
              How was your order?
            </h2>
            <p className="mt-1 text-body text-text-secondary">Help other buyers and {shopName}</p>
            <p className="mt-3 flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <Link
                  key={n}
                  href={`/o/${order.token}/review?stars=${n}`}
                  aria-label={`Rate ${n} out of 5`}
                  className="flex size-11 items-center justify-center text-text-muted hover:text-star"
                >
                  <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true">
                    <path
                      d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"
                      fill="currentColor"
                    />
                  </svg>
                </Link>
              ))}
            </p>
            <Link
              href={`/o/${order.token}/review`}
              className="mt-4 flex h-14 items-center justify-center rounded-pill bg-primary text-button text-text-on-primary"
            >
              Rate your order
            </Link>
          </section>
        ) : null}
      </>
    );
  } else if (cancelled) {
    const money =
      order.paymentStatus === 'refund_due'
        ? `${shopName} will send your money back on M-Pesa.`
        : order.paymentStatus === 'refunded'
          ? `${shopName} sent your money back on M-Pesa.`
          : order.paymentStatus === 'claimed'
            ? `If your payment reached ${shopName}, they’ll send it back on M-Pesa.`
            : null;
    hero = (
      <div className="mt-5 rounded-xl bg-surface-muted p-4">
        <p className="text-title text-navy">{expired ? 'Order expired' : 'Order cancelled'}</p>
        <p className="mt-1 text-body text-text-secondary">
          {BUYER_CANCEL_LABELS[order.cancelReason as CancelReason] ?? 'Cancelled'}
          {order.cancelledAt ? ` · ${orderTime(order.cancelledAt)}` : ''}
        </p>
        {money ? <p className="mt-2 text-body text-navy">{money}</p> : null}
      </div>
    );
  }

  const payLine =
    order.paymentMethod === 'pay_on_delivery'
      ? order.paymentStatus === 'paid'
        ? 'Paid on delivery'
        : `Pay on ${pickup ? 'collection' : 'delivery'}`
      : order.paymentStatus === 'paid'
        ? `Paid with M-Pesa${order.mpesaCode ? ` · ${order.mpesaCode}` : ''}`
        : order.mpesaCode && order.paymentStatus === 'claimed'
          ? `M-Pesa ${order.mpesaCode} · waiting for ${shopName} to confirm`
          : 'M-Pesa';

  return (
    <>
      {demo ? <DemoBanner /> : null}
      <main className="mx-auto min-h-dvh max-w-md bg-surface px-4 pt-6 pb-16">
        <h1 className="text-headline text-navy">Order #{order.number}</h1>
        <p className="text-body text-text-secondary">{summary}</p>
        {closedBanner}
        {suspendedBanner}
        {hero}

        {actions.includes('cancel') ? (
          <CancelCard
            token={order.token}
            shopName={shopName}
            claimed={order.paymentStatus === 'claimed'}
          />
        ) : null}

        {timeline.length ? (
          <section
            aria-labelledby="status-title"
            className="mt-5 rounded-xl border border-border p-4"
          >
            <h2 id="status-title" className="text-subtitle text-navy">
              Order status
            </h2>
            <ol className="mt-3">
              {timeline.map((s, i) => (
                <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < timeline.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className={`absolute top-8 bottom-0 left-[15px] w-0.5 ${
                        s.state === 'done' ? 'bg-green' : 'bg-border'
                      }`}
                    />
                  ) : null}
                  <span
                    aria-hidden="true"
                    className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-pill ${
                      s.state === 'done'
                        ? 'bg-green text-text-on-primary'
                        : s.state === 'current'
                          ? 'border-2 border-primary bg-surface ring-4 ring-primary-tint'
                          : s.key === 'rate'
                            ? 'border-2 border-dashed border-border bg-surface text-text-muted'
                            : 'border-2 border-border bg-surface'
                    }`}
                  >
                    {s.state === 'done' ? (
                      <Check size={16} />
                    ) : s.state === 'current' ? (
                      <span className="size-3 rounded-pill bg-primary" />
                    ) : s.key === 'rate' ? (
                      <span className="text-small">★</span>
                    ) : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className={`text-body-strong ${
                          s.state === 'current'
                            ? 'text-primary'
                            : s.state === 'done'
                              ? 'text-navy'
                              : 'text-text-secondary'
                        }`}
                      >
                        <span className="sr-only">
                          {s.state === 'done'
                            ? 'Done: '
                            : s.state === 'current'
                              ? 'Now: '
                              : 'Next: '}
                        </span>
                        {s.label}
                      </p>
                      {s.at ? (
                        <p className="shrink-0 text-small text-text-secondary">{orderTime(s.at)}</p>
                      ) : null}
                    </div>
                    {s.note ? <p className="text-small text-text-secondary">{s.note}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <section aria-labelledby="items-title" className="mt-5 rounded-xl border border-border p-4">
          <h2 id="items-title" className="text-subtitle text-navy">
            Your order
          </h2>
          <ul className="mt-2 divide-y divide-border">
            {order.items.map((i, n) => (
              <li key={n} className="flex items-center gap-3 py-3 text-body">
                <span className="size-12 shrink-0 overflow-hidden rounded-lg bg-beige">
                  {i.coverPath ? (
                    // eslint-disable-next-line @next/next/no-img-element -- plain thumbnails (decision #59)
                    <img
                      src={publicUrl(i.coverPath) ?? undefined}
                      alt=""
                      width={48}
                      height={48}
                      className="size-full object-cover"
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 text-navy">
                  {i.name}
                  {i.colour || i.size ? (
                    <span className="block text-small text-text-secondary">
                      {[i.colour, i.size ? `Size ${i.size}` : null].filter(Boolean).join(' · ')}
                    </span>
                  ) : null}
                </span>
                <span className="text-text-secondary">× {i.qty}</span>
                <span className="w-24 text-right text-body-strong text-navy">
                  {formatKes(i.unitPrice * i.qty)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-2 space-y-1 border-t border-border pt-3 text-body">
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">
                {pickup
                  ? 'Pickup'
                  : `Delivery${order.deliveryAreaName ? ` · ${order.deliveryAreaName}` : ''}`}
              </dt>
              <dd className="text-navy">
                {order.deliveryFee === 0 ? 'Free' : formatKes(order.deliveryFee)}
              </dd>
            </div>
            <div className="flex justify-between text-body-strong text-navy">
              <dt>Total</dt>
              <dd>{formatKes(order.total)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-small text-text-secondary">
            {pickup
              ? [order.shop?.pickupLocation, order.shop?.pickupHours].filter(Boolean).join(' · ') ||
                'Pickup'
              : order.addressText}
          </p>
          <p className="text-small text-text-secondary">{payLine}</p>
        </section>

        {help}

        <p className="mt-5 rounded-lg bg-peach p-4 text-body text-text-secondary">{bookmark}</p>
        {order.shop && shop.browsable ? (
          <Link
            href={`/${order.shop.slug}`}
            className="mt-5 flex h-14 items-center justify-center rounded-pill bg-primary-tint text-button text-primary"
          >
            Continue shopping
          </Link>
        ) : null}
      </main>
    </>
  );
}
