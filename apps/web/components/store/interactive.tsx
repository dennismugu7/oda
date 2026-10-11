'use client';

// The interactive bits of the shop pages (spec §6.1): card actions (favourite, green tick /
// "+" quick add), the sticky cart bar, Share and the one-time visit beacon.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowRightIcon,
  CheckIcon,
  HeartIcon,
  PlusIcon,
  ShareNetworkIcon,
  ShoppingBagIcon,
} from '@phosphor-icons/react';
import { formatKsh } from '@oda/shared';
import { cartCount, cartTotal, inCart, writeSource } from '@/lib/store/cart';
import { useCart, useFavourites, useHydrated } from './useShopStore';

export interface CardProduct {
  id: string;
  name: string;
  price: number;
  status: string;
  hasOptions: boolean;
  coverUrl: string | null;
}

export function FavouriteButton({
  shopId,
  productId,
  productName,
}: {
  shopId: string;
  productId: string;
  productName: string;
}) {
  const { ids, toggle } = useFavourites(shopId);
  const on = ids.includes(productId);
  return (
    <button
      type="button"
      aria-label={on ? `Remove ${productName} from favourites` : `Add ${productName} to favourites`}
      aria-pressed={on}
      onClick={(e) => {
        e.preventDefault();
        toggle(productId);
      }}
      className="absolute top-2.5 right-2.5 flex size-11 items-center justify-center rounded-pill bg-surface shadow-sm"
    >
      <HeartIcon
        size={20}
        weight={on ? 'fill' : 'regular'}
        aria-hidden="true"
        className={on ? 'text-primary' : 'text-navy'}
      />
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
        role="img"
        aria-label="In your cart"
        className="absolute right-2.5 bottom-2.5 flex size-11 items-center justify-center rounded-pill bg-green text-text-on-primary"
      >
        <CheckIcon size={22} aria-hidden="true" />
      </span>
    );
  }
  if (!canOrder || product.status !== 'available') return null;
  const plus = <PlusIcon size={22} aria-hidden="true" />;
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
        // This button turns into the green tick: keep focus on the cart bar's link instead
        // (the bar announces "Added to cart").
        requestAnimationFrame(() => document.getElementById('cart-bar-link')?.focus());
      }}
      className={style}
    >
      {plus}
    </button>
  );
}

export function CartBar({ shopId, slug }: { shopId: string; slug: string }) {
  const { lines } = useCart(shopId);
  const hydrated = useHydrated();
  const count = cartCount(lines);
  // "Added to cart" for screen readers when the count goes up on this page (not when the
  // saved cart is first read). Adjusted while rendering, React's pattern for derived state.
  const [seen, setSeen] = useState<{ count: number | null; message: string }>({
    count: null,
    message: '',
  });
  if (hydrated && seen.count !== count) {
    setSeen({
      count,
      message:
        seen.count !== null && count > seen.count
          ? `Added to cart. ${count} ${count === 1 ? 'item' : 'items'} in your cart.`
          : '',
    });
  }
  // The live region stays on the page so the message is read when it changes.
  const live = (
    <p aria-live="polite" className="sr-only">
      {seen.message}
    </p>
  );
  if (count === 0) return live;
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md px-4 pb-4">
      {live}
      <div className="flex items-center gap-3 rounded-sheet bg-navy p-2.5 pl-3 text-text-on-navy shadow-lg">
        <span className="relative flex size-12 items-center justify-center rounded-pill bg-navy-raised">
          <ShoppingBagIcon size={22} aria-hidden="true" />
          <span className="absolute -top-1 -right-1 flex size-6 items-center justify-center rounded-pill bg-primary text-small font-bold">
            {count}
          </span>
        </span>
        <span className="flex-1 leading-tight">
          <span className="block text-small text-toggle-off">
            {count} {count === 1 ? 'item' : 'items'}
          </span>
          <span className="block text-title">{formatKsh(cartTotal(lines))}</span>
        </span>
        <Link
          id="cart-bar-link"
          href={`/${slug}/cart`}
          className="flex h-12 items-center gap-2 rounded-pill bg-primary px-5 text-button text-text-on-primary"
        >
          View cart <ArrowRightIcon size={18} aria-hidden="true" />
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
    <>
      {/* Read out when the link is copied (the button's name stays the same). */}
      <span aria-live="polite" className="sr-only">
        {copied ? 'Link copied' : ''}
      </span>
      <button
        type="button"
        onClick={share}
        aria-label="Share this shop"
        className="flex size-12 shrink-0 items-center justify-center rounded-pill bg-surface-muted text-navy"
      >
        {copied ? (
          <span aria-hidden="true" className="text-small font-semibold">
            Copied
          </span>
        ) : (
          <ShareNetworkIcon size={22} aria-hidden="true" />
        )}
      </button>
    </>
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
