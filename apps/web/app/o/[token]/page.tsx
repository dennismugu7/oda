// The buyer's order page, /o/{token} (M5 CP2: first version). Opened only by the random token
// (never the order number or id), noindex, no referrer, lookups rate-limited per IP. CP3 adds
// the pay page (04b redesign) and the full status page (05, 6, 05c).
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatKes, stepperSteps } from '@oda/shared';
import { DemoBanner } from '@/components/store/DemoBanner';
import { openOrder, orderShop } from '@/server/checkout';
import { getDb } from '@/server/db';
import { isDemoShop } from '@/server/demo';
import { NotFoundError } from '@/server/errors';
import { orderTokenRepo } from '@/server/repos/order-token';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your order · oda',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

const ACCOUNT_LABEL = { till: 'Buy Goods Till', pochi: 'Pochi la Biashara', paybill: 'Paybill' };

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const db = getDb();
  let ctx;
  try {
    ctx = await openOrder(db, (await params).token, await headers());
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const [order, shop] = await Promise.all([orderTokenRepo(db, ctx).view(), orderShop(db, ctx)]);
  const shopName = order.shop?.name ?? 'the shop';
  const steps = stepperSteps(order, order.fulfilment, shopName);
  const account = order.paymentAccount as {
    type: keyof typeof ACCOUNT_LABEL;
    number: string;
    name: string;
    accountRef: string | null;
  } | null;
  const payNow = order.status === 'awaiting_payment' && order.paymentMethod === 'pay_before';

  return (
    <>
      {order.shop && isDemoShop(order.shop.slug) ? <DemoBanner /> : null}
      <main className="mx-auto min-h-dvh max-w-md bg-surface px-4 pt-8 pb-16">
        {shop.closed ? (
          <p
            role="status"
            className="mb-4 rounded-lg bg-warning-tint p-4 text-body text-warning-text-strong"
          >
            <strong>This shop has closed.</strong> Your order can’t change any more.
          </p>
        ) : null}
        <div className="flex size-16 items-center justify-center rounded-pill bg-green-tint text-green">
          <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="mt-4 text-headline text-navy">
          {order.status === 'cancelled' ? 'Order cancelled' : 'Order placed!'}
        </h1>
        <p className="mt-1 text-body text-text-secondary">
          Order #{order.number} from {shopName} · {formatKes(order.total)}
        </p>

        {payNow && account ? (
          <section className="mt-6 rounded-xl border border-border p-4">
            <h2 className="text-title text-navy">
              Pay {formatKes(order.total)} to {shopName}
            </h2>
            <p className="mt-2 text-body text-text-secondary">
              {ACCOUNT_LABEL[account.type]} <strong className="text-navy">{account.number}</strong>
              {account.accountRef ? (
                <>
                  {' '}
                  · Account <strong className="text-navy">{account.accountRef}</strong>
                </>
              ) : null}
            </p>
            <p className="mt-1 text-body text-text-secondary">
              You’ll see <strong className="text-navy">{account.name}</strong> before you enter your
              PIN.
            </p>
          </section>
        ) : order.status === 'awaiting_acceptance' ? (
          <p className="mt-6 rounded-xl bg-background p-4 text-body text-text-secondary">
            {shopName} will accept your order and get it to you. You pay{' '}
            <strong className="text-navy">{formatKes(order.total)}</strong>{' '}
            {order.fulfilment === 'pickup' ? 'when you collect it' : 'on delivery'}.
          </p>
        ) : null}

        {order.status !== 'cancelled' ? (
          <ol className="mt-6 space-y-3" aria-label="Order progress">
            {steps.map((s) => (
              <li key={s.step} className="flex items-center gap-3 text-body">
                <span
                  className={`flex size-7 items-center justify-center rounded-pill text-small font-bold ${
                    s.state === 'done'
                      ? 'bg-green text-text-on-primary'
                      : s.state === 'in_progress'
                        ? 'bg-warning-tint text-warning-text-strong'
                        : 'bg-surface-muted text-text-secondary'
                  }`}
                >
                  {s.step}
                </span>
                <span className={s.state === 'todo' ? 'text-text-secondary' : 'text-navy'}>
                  {s.state === 'in_progress'
                    ? `Waiting for ${shopName} to confirm your payment`
                    : s.buyerLabel}
                </span>
              </li>
            ))}
          </ol>
        ) : null}

        <ul className="mt-6 divide-y divide-border border-y border-border">
          {order.items.map((i, n) => (
            <li key={n} className="flex gap-3 py-3 text-body">
              <span className="flex-1 text-navy">
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
        <dl className="mt-3 space-y-1 text-body">
          <div className="flex justify-between">
            <dt className="text-text-secondary">
              {order.fulfilment === 'pickup'
                ? 'Pickup'
                : `Delivery · ${order.deliveryAreaName ?? ''}`}
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

        <p className="mt-6 rounded-lg bg-peach p-4 text-body text-text-secondary">
          Bookmark this page. It’s how you track your order and leave a review.
        </p>
        {order.shop && !shop.closed ? (
          <Link
            href={`/${order.shop.slug}`}
            className="mt-6 flex h-12 items-center justify-center rounded-pill border border-navy text-body-strong text-navy"
          >
            Back to {shopName}
          </Link>
        ) : null}
      </main>
    </>
  );
}
