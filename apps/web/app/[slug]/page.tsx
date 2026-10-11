// Shop home (web 01, with design-changes: no "order in 3h" banner, no stock badges, a
// WhatsApp chat button in the header: a round icon next to Share, so the search row fits a
// 360 px phone). Server-rendered; the cart, favourites, Share and the
// visit count run in the browser. `?c=` filters by category, `?q=` searches.
import type { Metadata } from 'next';
import Link from 'next/link';
import { formatKsh, storeQuery } from '@oda/shared';
import { CartBar, ShareButton, VisitBeacon } from '@/components/store/interactive';
import { ProductGrid } from '@/components/store/ProductGrid';
import {
  initials,
  loadShop,
  restOf,
  shopData,
  shopLink,
  takingOrders,
  whatsappLink,
} from '@/server/storefront';
import { SafeImg } from '@/components/SafeImg';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const shop = await loadShop(slug, restOf('', await searchParams));
  const title = `${shop.name} · Order on oda`;
  const description =
    shop.about ??
    `Shop ${shop.name}${shop.locationLabel ? ` in ${shop.locationLabel}` : ''}. Order in a few taps and pay the seller directly on M-Pesa.`;
  return {
    title,
    description,
    alternates: { canonical: shopLink(shop.slug) },
    openGraph: { title, description, url: shopLink(shop.slug), siteName: 'oda', type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function ShopHome({ params, searchParams }: Props) {
  const { slug } = await params;
  const raw = await searchParams;
  const query = storeQuery.parse({ c: first(raw.c) });
  const shop = await loadShop(slug, restOf('', raw));
  const data = shopData(shop);
  const [categories, products, areas] = await Promise.all([
    data.categories(),
    data.catalog({ c: query.c }),
    data.deliveryAreas(),
  ]);
  const canOrder = takingOrders(shop);
  const cheapest = areas.length ? Math.min(...areas.map((a) => a.fee)) : null;
  const deliveryLine = [
    cheapest !== null ? `Delivery from ${formatKsh(cheapest)}` : null,
    shop.freeDeliveryThreshold ? `Free over ${formatKsh(shop.freeDeliveryThreshold)}` : null,
    shop.pickupEnabled ? `Pickup${shop.pickupLocation ? ` in ${shop.pickupLocation}` : ''}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const meta = [
    shop.ratingCount > 0 ? `★ ${Number(shop.ratingAvg).toFixed(1)}` : null,
    shop.deliveredCount > 0
      ? `${shop.deliveredCount} ${shop.deliveredCount === 1 ? 'delivery' : 'deliveries'}`
      : null,
    shop.locationLabel,
  ].filter(Boolean);
  const activeCategory = categories.find((c) => c.id === query.c);

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-surface pb-32">
      <VisitBeacon slug={shop.slug} shopId={shop.id} />
      <header className="flex items-center gap-3 px-4 pt-5">
        {shop.logoUrl ? (
          <SafeImg
            src={shop.logoUrl}
            alt=""
            width={64}
            height={64}
            className="size-16 shrink-0 rounded-pill object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-16 shrink-0 items-center justify-center rounded-pill bg-navy text-title text-text-on-navy"
          >
            {initials(shop.name)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-1.5 text-title text-navy">
            <span className="truncate">{shop.name}</span>
          </h1>
          {meta.length ? (
            <p className="truncate text-body text-text-secondary">{meta.join(' · ')}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {shop.whatsappPhone ? (
            <a
              href={whatsappLink(shop.whatsappPhone, shop.name)}
              aria-label={`Chat with ${shop.name} on WhatsApp`}
              className="flex size-11 shrink-0 items-center justify-center rounded-pill border border-border bg-surface"
            >
              {/* WhatsApp's official green glyph, unmodified (public/brands/README.md). */}
              {/* eslint-disable-next-line @next/next/no-img-element -- a static brand file (decision #59) */}
              <img src="/brands/whatsapp-glyph-green.svg" alt="" width={22} height={22} />
            </a>
          ) : null}
          <ShareButton url={shopLink(shop.slug)} title={shop.name} />
        </div>
      </header>

      <div className="mt-4 px-4">
        <form
          action={`/${shop.slug}/search`}
          className="flex items-center gap-2 rounded-pill border border-border px-4 focus-within:border-navy focus-within:ring-2 focus-within:ring-navy"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            aria-hidden="true"
            className="shrink-0 text-navy"
          >
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path
              d="M16.5 16.5L21 21"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <label className="sr-only" htmlFor="q">
            Search this shop
          </label>
          <input
            id="q"
            name="q"
            type="search"
            placeholder="Search this shop"
            className="h-12 min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-text-muted"
          />
          <Link
            href={`/${shop.slug}/search?filters=1`}
            aria-label="Filters and sort"
            className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-pill text-navy"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M4 7h10M18 7h2M4 17h4M12 17h8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="16" cy="7" r="2" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="10" cy="17" r="2" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </Link>
        </form>
      </div>

      {shop.isPaused ? (
        <p
          role="status"
          className="mx-4 mt-4 rounded-lg bg-warning-tint p-4 text-body text-warning-text-strong"
        >
          <strong>{shop.name} is taking a break.</strong> Back soon. You can still look around.
        </p>
      ) : !canOrder ? (
        <p
          role="status"
          className="mx-4 mt-4 rounded-lg bg-warning-tint p-4 text-body text-warning-text-strong"
        >
          <strong>Not taking orders yet.</strong> You can look around and chat with the seller.
        </p>
      ) : deliveryLine ? (
        <p className="mx-4 mt-4 rounded-lg bg-peach px-4 py-3 text-body text-text-secondary">
          {deliveryLine}
        </p>
      ) : null}

      {categories.length > 0 ? (
        <nav
          aria-label="Categories"
          className="mt-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
        >
          {[{ id: undefined, name: 'All' }, ...categories].map((c) => {
            const on = c.id === query.c;
            return (
              <Link
                key={c.id ?? 'all'}
                href={c.id ? `/${shop.slug}?c=${c.id}` : `/${shop.slug}`}
                aria-current={on ? 'page' : undefined}
                className={`flex h-11 shrink-0 items-center rounded-pill border px-5 text-body-strong ${
                  on ? 'border-navy bg-navy text-text-on-navy' : 'border-border text-navy'
                }`}
              >
                {c.name}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <section className="mt-5 px-4" aria-labelledby="products-title">
        <h2 id="products-title" className="text-title text-navy">
          {activeCategory?.name ?? 'All products'}
        </h2>
        {products.length === 0 ? (
          <div className="mt-4 rounded-xl bg-background p-6 text-center">
            <p className="text-body-strong text-navy">No products here yet.</p>
            <p className="mt-1 text-body text-text-secondary">
              Chat with the seller to ask what’s coming.
            </p>
          </div>
        ) : (
          <ProductGrid
            products={products}
            shopId={shop.id}
            slug={shop.slug}
            canOrder={canOrder}
            className="mt-3"
          />
        )}
      </section>

      <footer className="mt-10 px-4 text-center text-small text-text-secondary">
        <p>
          Pay the seller directly on M-Pesa{shop.acceptsPayOnDelivery ? ' or on delivery' : ''}.
        </p>
        <p className="mt-2">
          <Link href="/" className="inline-flex min-h-11 items-center font-semibold text-navy">
            Made with oda<span className="text-green-bright">.</span>
          </Link>
        </p>
      </footer>
      <CartBar shopId={shop.id} slug={shop.slug} />
    </main>
  );
}
