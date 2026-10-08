// The product grid of the shop home (01) and search (07): cover thumbnail, one badge, the
// heart and the cart action over the photo, name, rating (once there are reviews), price and
// was-price. Server-rendered; the heart and cart action are small client components.
import Link from 'next/link';
import { formatKes, type ProductBadge } from '@oda/shared';
import { CardCartAction, FavouriteButton } from './interactive';

export interface GridProduct {
  id: string;
  name: string;
  price: number;
  compareAtPrice: number | null;
  status: string;
  hasOptions: boolean;
  ratingAvg: string | number | null;
  ratingCount: number;
  badge: ProductBadge | null;
  coverUrl: string | null;
}

const BADGE_LABEL: Record<ProductBadge, string> = {
  bestseller: 'Bestseller',
  new: 'New',
  sold_out: 'Sold out',
};

export function ProductGrid({
  products,
  shopId,
  slug,
  canOrder,
  className = '',
}: {
  products: GridProduct[];
  shopId: string;
  slug: string;
  canOrder: boolean;
  className?: string;
}) {
  return (
    <ul className={`grid grid-cols-2 gap-x-3 gap-y-5 ${className}`}>
      {products.map((p, i) => (
        <li key={p.id} className="relative">
          <Link href={`/${slug}/p/${p.id}`} className="block">
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
                  decoding="async"
                  className={`size-full object-cover ${p.status === 'sold_out' ? 'opacity-60' : ''}`}
                />
              ) : null}
              {p.badge ? (
                <span
                  className={`absolute top-2.5 left-2.5 rounded-pill px-3 py-1 text-small font-semibold ${
                    p.badge === 'sold_out' ? 'bg-navy text-text-on-navy' : 'bg-surface text-navy'
                  }`}
                >
                  {BADGE_LABEL[p.badge]}
                </span>
              ) : null}
            </div>
            <p className="mt-2 line-clamp-2 text-body text-navy">{p.name}</p>
            {p.ratingCount > 0 ? (
              <p className="text-small text-text-secondary">
                <span className="star-glyph">★</span> {Number(p.ratingAvg).toFixed(1)} (
                {p.ratingCount})
              </p>
            ) : null}
            <p className="mt-0.5 flex items-baseline gap-2">
              <span className="text-subtitle font-bold text-navy">{formatKes(p.price)}</span>
              {p.compareAtPrice ? (
                <span className="text-small text-text-secondary line-through">
                  {formatKes(p.compareAtPrice)}
                </span>
              ) : null}
            </p>
          </Link>
          {/* Beside the link, over the photo: links and buttons can't sit inside a link. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 aspect-square [&>*]:pointer-events-auto">
            <FavouriteButton shopId={shopId} productId={p.id} productName={p.name} />
            <CardCartAction
              shopId={shopId}
              slug={slug}
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
  );
}
