// Search (web 07, with design-changes: no stock badges; a filters sheet with category, size and
// max price) and sort Popular / Newest / Price (spec §6.1). Works without scripts: the search
// box and the filters are plain GET forms, so every result page is a shareable URL.
import type { Metadata } from 'next';
import Link from 'next/link';
import { formatKes, STORE_SORTS, storeQuery, type StoreQuery } from '@oda/shared';
import { CartBar, VisitBeacon } from '@/components/store/interactive';
import { ProductGrid } from '@/components/store/ProductGrid';
import { loadShop, restOf, shopData, takingOrders } from '@/server/storefront';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const SORT_LABEL: Record<(typeof STORE_SORTS)[number], string> = {
  popular: 'Popular',
  newest: 'Newest',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
};
const MAX_PRICES = [1000, 2000, 3000, 5000, 10000];

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const shop = await loadShop((await params).slug, restOf('/search', await searchParams));
  return { title: `Search · ${shop.name}`, robots: { index: false } };
}

/** The current search as a URL, with one parameter changed or removed. */
function searchUrl(
  slug: string,
  query: StoreQuery,
  change: Partial<Record<keyof StoreQuery, string | number | undefined>>,
) {
  const params = new URLSearchParams();
  const merged = { ...query, ...change };
  for (const key of ['q', 'c', 'size', 'max', 'sort'] as const) {
    const value = merged[key];
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return `/${slug}/search${qs ? `?${qs}` : ''}`;
}

export default async function Search({ params, searchParams }: Props) {
  const { slug } = await params;
  const raw = await searchParams;
  const query = storeQuery.parse({
    q: first(raw.q),
    c: first(raw.c),
    size: first(raw.size),
    max: first(raw.max),
    sort: first(raw.sort),
  });
  const shop = await loadShop(slug, restOf('/search', raw));
  const data = shopData(shop);
  const [categories, all, products] = await Promise.all([
    data.categories(),
    data.catalog(),
    data.catalog(query),
  ]);
  const sizes = [...new Set(all.flatMap((p) => p.sizes))];
  const category = categories.find((c) => c.id === query.c);
  const chips = [
    category ? { label: category.name, url: searchUrl(shop.slug, query, { c: undefined }) } : null,
    query.size
      ? { label: `Size ${query.size}`, url: searchUrl(shop.slug, query, { size: undefined }) }
      : null,
    query.max
      ? {
          label: `Under ${formatKes(query.max)}`,
          url: searchUrl(shop.slug, query, { max: undefined }),
        }
      : null,
  ].filter((c): c is { label: string; url: string } => !!c);
  const filtersOpen = first(raw.filters) === '1';
  const select =
    'mt-1 h-12 w-full rounded-lg border border-border bg-surface px-3 text-body text-navy';

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-surface pb-32">
      <VisitBeacon slug={shop.slug} />
      <h1 className="sr-only">Search {shop.name}</h1>
      <div className="flex items-center gap-2 px-4 pt-5">
        <Link
          href={`/${shop.slug}`}
          aria-label={`Back to ${shop.name}`}
          className="flex size-12 shrink-0 items-center justify-center rounded-pill bg-surface-muted text-navy"
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
        <form
          action={`/${shop.slug}/search`}
          className="flex flex-1 items-center gap-2 rounded-pill border-2 border-navy px-4 focus-within:ring-2 focus-within:ring-primary"
        >
          <label className="sr-only" htmlFor="q">
            Search {shop.name}
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query.q ?? ''}
            placeholder="Search this shop"
            autoFocus={!query.q && !filtersOpen}
            className="h-11 min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-text-muted"
          />
          {query.c ? <input type="hidden" name="c" value={query.c} /> : null}
          {query.size ? <input type="hidden" name="size" value={query.size} /> : null}
          {query.max ? <input type="hidden" name="max" value={query.max} /> : null}
          {query.sort ? <input type="hidden" name="sort" value={query.sort} /> : null}
          {query.q ? (
            <Link
              href={searchUrl(shop.slug, query, { q: undefined })}
              aria-label="Clear the search"
              className="-mr-2 flex size-9 items-center justify-center rounded-pill bg-surface-muted text-navy"
            >
              ×
            </Link>
          ) : null}
        </form>
      </div>

      <details open={filtersOpen} className="group mx-4 mt-4">
        <summary className="flex h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-pill border border-navy px-4 text-body-strong text-navy [&::-webkit-details-marker]:hidden">
          Filters & sort
          {chips.length ? (
            <span className="flex size-6 items-center justify-center rounded-pill bg-primary text-small font-bold text-text-on-primary">
              {chips.length}
            </span>
          ) : null}
        </summary>
        <form
          action={`/${shop.slug}/search`}
          className="mt-3 grid gap-3 rounded-xl bg-background p-4"
        >
          {query.q ? <input type="hidden" name="q" value={query.q} /> : null}
          {categories.length ? (
            <label className="text-body-strong text-navy">
              Category
              <select name="c" defaultValue={query.c ?? ''} className={select}>
                <option value="">All</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {sizes.length ? (
            <label className="text-body-strong text-navy">
              Size
              <select name="size" defaultValue={query.size ?? ''} className={select}>
                <option value="">Any size</option>
                {sizes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="text-body-strong text-navy">
            Max price
            <select name="max" defaultValue={query.max ? String(query.max) : ''} className={select}>
              <option value="">Any price</option>
              {MAX_PRICES.map((m) => (
                <option key={m} value={m}>
                  Under {formatKes(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-body-strong text-navy">
            Sort
            <select name="sort" defaultValue={query.sort ?? ''} className={select}>
              <option value="">Shop order</option>
              {STORE_SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="h-12 rounded-pill bg-primary text-button text-text-on-primary"
          >
            Show results
          </button>
        </form>
      </details>

      {chips.length ? (
        <ul aria-label="Active filters" className="mt-3 flex flex-wrap gap-2 px-4">
          {chips.map((c) => (
            <li key={c.label}>
              <Link
                href={c.url}
                aria-label={`Remove filter ${c.label}`}
                className="flex h-10 items-center gap-1.5 rounded-pill border border-primary bg-primary-tint px-4 text-body-strong text-primary"
              >
                {c.label} <span aria-hidden="true">×</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-4 px-4 text-body text-text-secondary" aria-live="polite">
        <strong className="text-navy">
          {products.length} {products.length === 1 ? 'product' : 'products'}
        </strong>
        {query.q ? <> for “{query.q}”</> : null}
        {query.sort ? <> · {SORT_LABEL[query.sort]}</> : null}
      </p>

      {products.length === 0 ? (
        <div className="mx-4 mt-4 rounded-xl bg-background p-6 text-center">
          <p className="text-body-strong text-navy">Nothing matches.</p>
          <p className="mt-1 text-body text-text-secondary">
            Try fewer filters, or{' '}
            <Link href={`/${shop.slug}`} className="font-semibold text-primary underline">
              see all products
            </Link>
            .
          </p>
        </div>
      ) : (
        <ProductGrid
          products={products}
          shopId={shop.id}
          slug={shop.slug}
          canOrder={takingOrders(shop)}
          className="mt-3 px-4"
        />
      )}
      <CartBar shopId={shop.id} slug={shop.slug} />
    </main>
  );
}
