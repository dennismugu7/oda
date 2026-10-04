// Shop home (web 01, with design-changes: no "order in 3h" banner, no stock badges, a
// WhatsApp chat button in the header). Server-rendered; the cart, favourites, Share and the
// visit count run in the browser. `?c=` filters by category, `?q=` searches.
import type { Metadata } from 'next';
import Link from 'next/link';
import { formatKes, storeQuery } from '@oda/shared';
import {
  CardCartAction,
  CartBar,
  FavouriteButton,
  ShareButton,
  VisitBeacon,
} from '@/components/store/interactive';
import {
  initials,
  loadShop,
  shopData,
  shopLink,
  takingOrders,
  whatsappLink,
} from '@/server/storefront';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const shop = await loadShop(slug);
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

const BADGE_LABEL = { bestseller: 'Bestseller', new: 'New', sold_out: 'Sold out' } as const;

export default async function ShopHome({ params, searchParams }: Props) {
  const { slug } = await params;
  const raw = await searchParams;
  const query = storeQuery.parse({ c: first(raw.c), q: first(raw.q) });
  const shop = await loadShop(slug, query.c ? `?c=${query.c}` : '');
  const data = shopData(shop);
  const [categories, products, areas] = await Promise.all([
    data.categories(),
    data.catalog({ c: query.c, q: query.q }),
    data.deliveryAreas(),
  ]);
  const canOrder = takingOrders(shop);
  const cheapest = areas.length ? Math.min(...areas.map((a) => a.fee)) : null;
  const deliveryLine = [
    cheapest !== null ? `Delivery from ${formatKes(cheapest)}` : null,
    shop.freeDeliveryThreshold ? `Free over ${formatKes(shop.freeDeliveryThreshold)}` : null,
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
      <VisitBeacon slug={shop.slug} />
      <header className="flex items-center gap-3 px-4 pt-5">
        {shop.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- plain images, no optimizer (decision #59)
          <img
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
            {shop.mpesaChecked ? (
              <span title="M-Pesa till checked by oda" className="shrink-0 text-green">
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  aria-label="M-Pesa till checked by oda"
                >
                  <circle cx="12" cy="12" r="10" fill="currentColor" />
                  <path
                    d="M7.5 12.5l3 3 6-6.5"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            ) : null}
          </h1>
          {meta.length ? (
            <p className="truncate text-body text-text-secondary">{meta.join(' · ')}</p>
          ) : null}
        </div>
        <ShareButton url={shopLink(shop.slug)} title={shop.name} />
      </header>

      <div className="mt-4 flex gap-2 px-4">
        <form
          action={`/${shop.slug}`}
          className="flex flex-1 items-center gap-2 rounded-pill border border-border px-4"
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
            defaultValue={query.q ?? ''}
            placeholder="Search this shop"
            className="h-12 min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-text-muted"
          />
        </form>
        <a
          href={whatsappLink(shop.whatsappPhone, shop.name)}
          className="flex h-12 shrink-0 items-center gap-1.5 rounded-pill bg-green px-4 text-body-strong text-text-on-primary"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              d="M4 20l1.3-4A8 8 0 1112 20a8 8 0 01-3.8-1L4 20z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          Chat
        </a>
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
          {query.q ? `Results for “${query.q}”` : (activeCategory?.name ?? 'All products')}
        </h2>
        {products.length === 0 ? (
          <div className="mt-4 rounded-xl bg-background p-6 text-center">
            <p className="text-body-strong text-navy">
              {query.q ? 'Nothing matches that search.' : 'No products here yet.'}
            </p>
            <p className="mt-1 text-body text-text-secondary">
              {query.q ? (
                <Link href={`/${shop.slug}`} className="font-semibold text-primary underline">
                  See all products
                </Link>
              ) : (
                'Chat with the seller to ask what’s coming.'
              )}
            </p>
          </div>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-5">
            {products.map((p, i) => (
              <li key={p.id} className="relative">
                <Link href={`/${shop.slug}/p/${p.id}`} className="block">
                  <div className="relative aspect-square overflow-hidden rounded-xl bg-beige">
                    {p.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- plain thumbnails (decision #59)
                      <img
                        src={p.coverUrl}
                        alt=""
                        width={400}
                        height={400}
                        loading={i < 4 ? 'eager' : 'lazy'}
                        fetchPriority={i < 2 ? 'high' : undefined}
                        className={`size-full object-cover ${p.status === 'sold_out' ? 'opacity-60' : ''}`}
                      />
                    ) : null}
                    {p.badge ? (
                      <span
                        className={`absolute top-2.5 left-2.5 rounded-pill px-3 py-1 text-small font-semibold ${
                          p.badge === 'sold_out'
                            ? 'bg-navy text-text-on-navy'
                            : 'bg-surface text-navy'
                        }`}
                      >
                        {BADGE_LABEL[p.badge]}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 line-clamp-2 text-body text-navy">{p.name}</p>
                  {p.ratingCount > 0 ? (
                    <p className="text-small text-text-secondary">
                      <span className="text-star">★</span> {Number(p.ratingAvg).toFixed(1)} (
                      {p.ratingCount})
                    </p>
                  ) : null}
                  <p className="mt-0.5 flex items-baseline gap-2">
                    <span className="text-subtitle font-bold text-navy">{formatKes(p.price)}</span>
                    {p.compareAtPrice ? (
                      <span className="text-small text-text-muted line-through">
                        {formatKes(p.compareAtPrice)}
                      </span>
                    ) : null}
                  </p>
                </Link>
                {/* Beside the link, over the photo: links and buttons can't sit inside a link. */}
                <div className="pointer-events-none absolute inset-x-0 top-0 aspect-square [&>*]:pointer-events-auto">
                  <FavouriteButton shopId={shop.id} productId={p.id} />
                  <CardCartAction
                    shopId={shop.id}
                    slug={shop.slug}
                    canOrder={canOrder}
                    product={{
                      id: p.id,
                      name: p.name,
                      price: p.price,
                      status: p.status,
                      hasOptions: p.hasOptions,
                      coverUrl: p.coverUrl,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-10 px-4 text-center text-small text-text-muted">
        <p>
          Pay the seller directly on M-Pesa{shop.acceptsPayOnDelivery ? ' or on delivery' : ''}.
        </p>
        <p className="mt-2">
          <Link href="/" className="font-semibold text-navy">
            Made with oda<span className="text-green-bright">.</span>
          </Link>
        </p>
      </footer>
      <CartBar shopId={shop.id} slug={shop.slug} />
    </main>
  );
}
