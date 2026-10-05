// Product page (web 02, with design-changes: no "only 3 left" or arrival date, no size guide;
// "{units_sold} sold" only from 5; delivery card "Delivery from KES x · Free over KES y";
// payment card "Pay the seller directly on M-Pesa" (+ "or on delivery")). Reviews arrive in
// M7, so the rating line and reviews show only once there are some (decision #59 c).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatKes } from '@oda/shared';
import { FavouriteButton, VisitBeacon } from '@/components/store/interactive';
import { CartIcon, Gallery, ProductBuy } from '@/components/store/product';
import Link from 'next/link';
import { HttpError } from '@/server/errors';
import { loadShop, restOf, shopData, shopLink, takingOrders } from '@/server/storefront';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function loadProduct({ params, searchParams }: Props) {
  const { slug, id } = await params;
  const shop = await loadShop(slug, restOf(`/p/${id}`, await searchParams));
  const data = shopData(shop);
  try {
    const product = await data.product(id);
    return { shop, data, product };
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { shop, product } = await loadProduct(props);
  const title = `${product.name} · ${formatKes(product.price)} · ${shop.name}`;
  const description =
    product.description ?? `Order ${product.name} from ${shop.name} and pay the seller on M-Pesa.`;
  const url = `${shopLink(shop.slug)}/p/${product.id}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: 'oda', type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function ProductPage(props: Props) {
  const { shop, data, product } = await loadProduct(props);
  const [cards, areas] = await Promise.all([data.catalog(), data.deliveryAreas()]);
  const badge = cards.find((c) => c.id === product.id)?.badge ?? null;
  const canOrder = takingOrders(shop);
  const cheapest = areas.length ? Math.min(...areas.map((a) => a.fee)) : null;
  const delivery = [
    cheapest !== null ? `Delivery from ${formatKes(cheapest)}` : null,
    shop.freeDeliveryThreshold ? `Free over ${formatKes(shop.freeDeliveryThreshold)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const pickup = shop.pickupEnabled
    ? `Pickup${shop.pickupLocation ? ` in ${shop.pickupLocation}` : ''}`
    : null;
  const save =
    product.compareAtPrice && product.compareAtPrice > product.price
      ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
      : null;
  const payLine = shop.payNowAvailable
    ? `Pay the seller directly on M-Pesa${shop.acceptsPayOnDelivery ? ' or on delivery' : ''}`
    : shop.acceptsPayOnDelivery
      ? 'Pay the seller on delivery'
      : null;

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-surface px-4 pt-4 pb-32">
      <VisitBeacon slug={shop.slug} shopId={shop.id} />
      <div className="relative">
        <Gallery photos={product.photos} name={product.name} />
        <Link
          href={`/${shop.slug}`}
          aria-label={`Back to ${shop.name}`}
          className="absolute top-3 left-3 flex size-12 items-center justify-center rounded-pill bg-surface text-navy shadow-sm"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M15 5l-7 7 7 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <div className="absolute top-3 right-3 flex gap-2 [&>button]:static">
          <FavouriteButton shopId={shop.id} productId={product.id} />
          <CartIcon shopId={shop.id} slug={shop.slug} />
        </div>
        {badge ? (
          <span className="absolute bottom-3 left-3 rounded-pill bg-navy px-3 py-1 text-small font-semibold text-text-on-navy">
            {badge === 'sold_out' ? 'Sold out' : badge === 'bestseller' ? 'Bestseller' : 'New'}
          </span>
        ) : null}
      </div>

      <h1 className="mt-4 text-headline text-navy">{product.name}</h1>
      {product.ratingCount > 0 || product.unitsSold ? (
        <p className="mt-1 text-body text-text-secondary">
          {product.ratingCount > 0 ? (
            <>
              <span className="text-star">★</span> {Number(product.ratingAvg).toFixed(1)} ·{' '}
              {product.ratingCount} {product.ratingCount === 1 ? 'review' : 'reviews'}
            </>
          ) : null}
          {product.ratingCount > 0 && product.unitsSold ? ' · ' : null}
          {product.unitsSold ? `${product.unitsSold} sold` : null}
        </p>
      ) : null}
      <p className="mt-3 flex flex-wrap items-baseline gap-3">
        <span className="text-display text-navy">{formatKes(product.price)}</span>
        {product.compareAtPrice ? (
          <span className="text-subtitle text-text-secondary line-through">
            {formatKes(product.compareAtPrice)}
          </span>
        ) : null}
        {save ? (
          <span className="rounded-md bg-green-tint px-2.5 py-1 text-body-strong text-green">
            Save {save}%
          </span>
        ) : null}
      </p>

      <ProductBuy
        shopId={shop.id}
        slug={shop.slug}
        canOrder={canOrder}
        blockedReason={shop.isPaused ? `${shop.name} is taking a break` : 'Not taking orders yet'}
        product={{
          id: product.id,
          name: product.name,
          price: product.price,
          status: product.status,
          sizes: product.sizes,
          colours: product.colours as { name: string; hex?: string }[],
          coverUrl: product.photos[0]?.thumbUrl ?? null,
        }}
      />

      {delivery || pickup || payLine ? (
        <div className="mt-6 divide-y divide-border rounded-xl border border-border">
          {delivery || pickup ? (
            <div className="p-4">
              <p className="text-body-strong text-navy">{delivery || pickup}</p>
              {delivery && pickup ? (
                <p className="text-body text-text-secondary">{pickup}</p>
              ) : null}
            </div>
          ) : null}
          {payLine ? (
            <div className="p-4">
              <p className="text-body-strong text-navy">{payLine}</p>
              {shop.mpesaChecked ? (
                <p className="text-body text-green">M-Pesa till checked by oda</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {product.description ? (
        <section className="mt-6">
          <h2 className="text-title text-navy">About this product</h2>
          <p className="mt-2 text-body whitespace-pre-line text-text-secondary">
            {product.description}
          </p>
        </section>
      ) : null}
    </main>
  );
}
