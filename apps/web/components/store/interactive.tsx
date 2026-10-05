'use client';

// The interactive bits of the shop pages (spec §6.1): card actions (favourite, green tick /
// "+" quick add), the sticky cart bar, Share and the one-time visit beacon.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatKes } from '@oda/shared';
import { cartCount, cartTotal, inCart, writeSource } from '@/lib/store/cart';
import { useCart, useFavourites } from './useShopStore';

export interface CardProduct {
  id: string;
  name: string;
  price: number;
  status: string;
  hasOptions: boolean;
  coverUrl: string | null;
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M12 20.5s-7.5-4.6-9.3-9.3C1.6 8.2 3.6 5 6.8 5c2 0 3.4 1.1 4.2 2.4h2C13.8 6.1 15.2 5 17.2 5c3.2 0 5.2 3.2 4.1 6.2-1.8 4.7-9.3 9.3-9.3 9.3z"
        fill={filled ? 'var(--color-primary)' : 'none'}
        stroke={filled ? 'var(--color-primary)' : 'var(--color-navy)'}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FavouriteButton({ shopId, productId }: { shopId: string; productId: string }) {
  const { ids, toggle } = useFavourites(shopId);
  const on = ids.includes(productId);
  return (
    <button
      type="button"
      aria-label={on ? 'Remove from favourites' : 'Add to favourites'}
      aria-pressed={on}
      onClick={(e) => {
        e.preventDefault();
        toggle(productId);
      }}
      className="absolute top-2.5 right-2.5 flex size-11 items-center justify-center rounded-pill bg-surface shadow-sm"
    >
      <HeartIcon filled={on} />
    </button>
  );
}

/**
 * Green tick when the product is already in the cart; "+" quick-adds a product without sizes
 * or colours; otherwise "+" opens the product page to choose (spec §6.1).
 */
export function CardCartAction({
  shopId,
  slug,
  product,
  canOrder,
}: {
  shopId: string;
  slug: string;
  product: CardProduct;
  canOrder: boolean;
}) {
  const { lines, add } = useCart(shopId);
  if (inCart(lines, product.id)) {
    return (
      <span
        aria-label="In your cart"
        className="absolute right-2.5 bottom-2.5 flex size-11 items-center justify-center rounded-pill bg-green text-text-on-primary"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  if (!canOrder || product.status !== 'available') return null;
  const plus = (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
  const style =
    'absolute right-2.5 bottom-2.5 flex size-11 items-center justify-center rounded-pill bg-navy text-text-on-navy shadow-md';
  if (product.hasOptions) {
    return (
      <Link
        href={`/${slug}/p/${product.id}`}
        aria-label={`Choose options for ${product.name}`}
        className={style}
      >
        {plus}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={`Add ${product.name} to cart`}
      onClick={(e) => {
        e.preventDefault();
        add({
          productId: product.id,
          size: null,
          colour: null,
          qty: 1,
          price: product.price,
          name: product.name,
          coverUrl: product.coverUrl,
        });
      }}
      className={style}
    >
      {plus}
    </button>
  );
}

export function CartBar({ shopId, slug }: { shopId: string; slug: string }) {
  const { lines } = useCart(shopId);
  const count = cartCount(lines);
  if (count === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md px-4 pb-4">
      <div className="flex items-center gap-3 rounded-sheet bg-navy p-2.5 pl-3 text-text-on-navy shadow-lg">
        <span className="relative flex size-12 items-center justify-center rounded-pill bg-navy-raised">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M6 8h12l-1 12H7L6 8zm3 0a3 3 0 016 0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          <span className="absolute -top-1 -right-1 flex size-6 items-center justify-center rounded-pill bg-primary text-small font-bold">
            {count}
          </span>
        </span>
        <span className="flex-1 leading-tight">
          <span className="block text-small text-toggle-off">
            {count} {count === 1 ? 'item' : 'items'}
          </span>
          <span className="block text-title">{formatKes(cartTotal(lines))}</span>
        </span>
        <Link
          href={`/${slug}/cart`}
          className="flex h-12 items-center gap-2 rounded-pill bg-primary px-5 text-button text-text-on-primary"
        >
          View cart <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}

export function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
    } catch {
      return; // the buyer closed the share sheet
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link', url);
    }
  }
  return (
    <button
      type="button"
      onClick={share}
      aria-label={copied ? 'Link copied' : 'Share this shop'}
      className="flex size-12 shrink-0 items-center justify-center rounded-pill bg-surface-muted text-navy"
    >
      {copied ? (
        <span className="text-small font-semibold">Copied</span>
      ) : (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <circle cx="18" cy="5.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="6" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="18" cy="18.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      )}
    </button>
  );
}

// Shops already reported from this page load (React may run effects twice in development,
// and two requests racing before the cookie is set would both count).
const reported = new Set<string>();

/**
 * Counts the visit once (the server de-duplicates per day); bots without scripts don't. A
 * link's ?s= tag is also kept on this device for the shop until the next order (M5), so
 * "via TikTok" survives browsing to other pages.
 */
export function VisitBeacon({ slug, shopId }: { slug: string; shopId: string }) {
  useEffect(() => {
    if (reported.has(slug)) return;
    reported.add(slug);
    const s = new URLSearchParams(window.location.search).get('s');
    if (s) writeSource(shopId, s);
    fetch(`/api/shops/${slug}/visit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ s }),
      keepalive: true,
    }).catch(() => {});
  }, [slug, shopId]);
  return null;
}
