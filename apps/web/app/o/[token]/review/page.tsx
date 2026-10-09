// The review page, /o/{token}/review (spec §6.7, web 5d, decision #73). Delivered buyer-placed
// orders: the form (create, or edit within 7 days); after that a read-only "Your review".
// Orders not yet delivered and manual orders get a short explanation instead. Opened only by
// the random token; noindex, no referrer, lookups rate-limited per IP.
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RATING_LABELS } from '@oda/shared';
import { ReviewForm } from '@/components/order/ReviewForm';
import { Stars } from '@/components/store/ProductReviews';
import { orderTime } from '@/lib/time';
import { openOrder } from '@/server/checkout';
import { getDb } from '@/server/db';
import { NotFoundError } from '@/server/errors';
import { buyerReviewRepo } from '@/server/repos/reviews';
import { SafeImg } from '@/components/SafeImg';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Rate your order · oda',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

function Notice({ token, title, text }: { token: string; title: string; text: string }) {
  return (
    <main className="mx-auto min-h-dvh max-w-md bg-surface px-4 pt-10 pb-16 text-center">
      <h1 className="text-headline text-navy">{title}</h1>
      <p className="mt-2 text-body text-text-secondary">{text}</p>
      <Link
        href={`/o/${token}`}
        className="mt-6 flex h-14 items-center justify-center rounded-pill bg-primary-tint text-button text-primary"
      >
        Back to your order
      </Link>
    </main>
  );
}

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const db = getDb();
  let ctx;
  try {
    ctx = await openOrder(db, (await params).token, await headers());
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const form = await buyerReviewRepo(db, ctx).form();
  const token = form.order.token;
  const shopName = form.shop?.name ?? 'the shop';

  if (form.order.manual) {
    return (
      <Notice
        token={token}
        title="Reviews aren’t open for this order"
        text={`Reviews are for orders placed in ${shopName}’s oda shop.`}
      />
    );
  }
  if (!form.order.reviewable) {
    return (
      <Notice
        token={token}
        title="Not delivered yet"
        text="You can rate your order once it’s delivered."
      />
    );
  }

  const subtitle = `Order #${form.order.number}${
    form.order.deliveredAt ? ` · Delivered ${orderTime(form.order.deliveredAt)}` : ''
  }`;

  if (form.review && !form.review.editable) {
    const r = form.review;
    return (
      <main className="mx-auto min-h-dvh max-w-md bg-surface px-4 pt-6 pb-16">
        <h1 className="text-headline text-navy">Your review</h1>
        <p className="text-body text-text-secondary">{subtitle}</p>
        <section className="mt-5 rounded-xl bg-peach p-5 text-center">
          <p className="text-body text-navy">{shopName}</p>
          <div className="mt-2 flex justify-center">
            <Stars rating={r.rating} size={32} />
          </div>
          <p className="mt-1 text-body-strong text-primary">{RATING_LABELS[r.rating - 1]}</p>
          {r.tags.length ? (
            <p className="mt-2 text-body text-text-secondary">{r.tags.join(' · ')}</p>
          ) : null}
        </section>
        <ul className="mt-5 space-y-3">
          {form.items.map((item) => {
            const mine = r.items.find((i) => i.orderItemId === item.orderItemId);
            if (!mine) return null;
            return (
              <li key={item.orderItemId} className="rounded-xl border border-border p-4">
                <p className="text-body-strong text-navy">{item.name}</p>
                {mine.rating ? <Stars rating={mine.rating} /> : null}
                {mine.text ? <p className="mt-2 text-body text-navy">{mine.text}</p> : null}
                {mine.photoUrl ? (
                  <SafeImg
                    src={mine.photoUrl}
                    alt={`Your photo of ${item.name}`}
                    className="mt-3 size-24 rounded-lg object-cover"
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-5 text-small text-text-secondary">
          Reviews can be changed for 7 days after they’re written.
        </p>
        <Link
          href={`/o/${token}`}
          className="mt-5 flex h-14 items-center justify-center rounded-pill bg-primary-tint text-button text-primary"
        >
          Back to your order
        </Link>
      </main>
    );
  }

  const stars = Number((await searchParams).stars);
  return (
    <ReviewForm
      token={token}
      shopName={shopName}
      shopInitials={initials(shopName)}
      shopLogoUrl={form.shop?.logoUrl ?? null}
      subtitle={subtitle}
      displayName={form.displayName}
      items={form.items}
      existing={form.review}
      initialStars={Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : null}
    />
  );
}
