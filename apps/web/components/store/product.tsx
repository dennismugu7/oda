'use client';

// The product page's interactive parts (web 02): the photo carousel with "1 / 4", the cart
// icon with its count, and colour, size, quantity and "Add to cart · KSh x" (spec §6.2).
import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  ArrowRightIcon,
  CheckIcon,
  MinusIcon,
  PlusIcon,
  ShoppingBagIcon,
} from '@phosphor-icons/react';
import { formatKsh } from '@oda/shared';
import { cartCount, MAX_QTY } from '@/lib/store/cart';
import { useCart } from './useShopStore';
import { SafeImg } from '@/components/SafeImg';

export function Gallery({ photos: all, name }: { photos: { url: string | null }[]; name: string }) {
  const [index, setIndex] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  // A photo without a URL (not ready yet) is left out: never an empty src.
  const photos = all.filter((p): p is { url: string } => !!p.url);
  if (photos.length === 0) return <div className="aspect-square rounded-xl bg-beige" />;
  return (
    <div className="relative">
      <div
        ref={strip}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex aspect-square snap-x snap-mandatory overflow-x-auto rounded-xl bg-beige [scrollbar-width:none]"
        role="region"
        aria-label={`${name}: ${photos.length} photo${photos.length === 1 ? '' : 's'}`}
        // Focusable so the photos can be scrolled with the arrow keys.
        tabIndex={photos.length > 1 ? 0 : undefined}
      >
        {photos.map((p, i) => (
          <SafeImg
            key={i}
            src={p.url}
            alt={i === 0 ? name : `${name}, photo ${i + 1} of ${photos.length}`}
            width={1200}
            height={1200}
            loading={i === 0 ? 'eager' : 'lazy'}
            fetchPriority={i === 0 ? 'high' : undefined}
            className="size-full shrink-0 snap-center object-cover"
          />
        ))}
      </div>
      {photos.length > 1 ? (
        <>
          <span className="absolute right-3 bottom-3 rounded-pill bg-surface px-3 py-1 text-small font-semibold text-navy">
            {index + 1} / {photos.length}
          </span>
          <div
            className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5"
            aria-hidden="true"
          >
            {photos.map((_, i) => (
              <span
                key={i}
                className={`h-2 rounded-pill ${i === index ? 'w-6 bg-navy' : 'w-2 bg-toggle-off'}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function CartIcon({ shopId, slug }: { shopId: string; slug: string }) {
  const { lines } = useCart(shopId);
  const count = cartCount(lines);
  return (
    <Link
      href={`/${slug}/cart`}
      aria-label={count ? `Cart, ${count} items` : 'Cart'}
      className="relative flex size-12 items-center justify-center rounded-pill bg-surface text-navy shadow-sm"
    >
      <ShoppingBagIcon size={22} aria-hidden="true" />
      {count ? (
        <span className="absolute -top-1 -right-1 flex size-6 items-center justify-center rounded-pill bg-primary text-small font-bold text-text-on-primary">
          {count}
        </span>
      ) : null}
    </Link>
  );
}

export interface BuyProduct {
  id: string;
  name: string;
  price: number;
  status: string;
  sizes: string[];
  colours: { name: string; hex?: string }[];
  coverUrl: string | null;
}

export function ProductBuy({
  shopId,
  slug,
  product,
  canOrder,
  blockedReason,
}: {
  shopId: string;
  slug: string;
  product: BuyProduct;
  canOrder: boolean;
  blockedReason: string | null;
}) {
  const { add } = useCart(shopId);
  const [colour, setColour] = useState<string | null>(
    product.colours.length === 1 ? product.colours[0]!.name : null,
  );
  const [size, setSize] = useState<string | null>(
    product.sizes.length === 1 ? product.sizes[0]! : null,
  );
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const soldOut = product.status === 'sold_out';

  function addToCart() {
    if (product.colours.length > 0 && !colour) return setHint('Choose a colour.');
    if (product.sizes.length > 0 && !size) return setHint('Choose a size.');
    setHint(null);
    add({
      productId: product.id,
      size,
      colour,
      qty,
      price: product.price,
      name: product.name,
      coverUrl: product.coverUrl,
    });
    setAdded(true);
  }

  return (
    <>
      {product.colours.length ? (
        <fieldset className="mt-5">
          <legend className="text-body text-text-secondary">
            Colour: <strong className="text-navy">{colour ?? 'choose one'}</strong>
          </legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {product.colours.map((c) => {
              const on = colour === c.name;
              return (
                <button
                  key={c.name}
                  type="button"
                  aria-pressed={on}
                  aria-label={c.name}
                  onClick={() => {
                    setColour(c.name);
                    setHint(null);
                  }}
                  className={`relative flex h-12 min-w-12 items-center justify-center rounded-pill px-1 ${
                    on ? 'border-[3px] border-navy' : 'border-2 border-border'
                  }`}
                >
                  {c.hex ? (
                    <span
                      className="size-9 rounded-pill border border-border"
                      style={{ background: c.hex }}
                    />
                  ) : (
                    <span className="px-3 text-body-strong text-navy">{c.name}</span>
                  )}
                  {/* Selected is shown by a tick too, not by colour alone. */}
                  {on ? (
                    <span
                      aria-hidden="true"
                      className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-pill bg-navy text-text-on-navy"
                    >
                      {/* Bold: a regular stroke is under 1 px at this size. */}
                      <CheckIcon size={12} weight="bold" aria-hidden="true" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      {product.sizes.length ? (
        <fieldset className="mt-5">
          <legend className="text-body text-text-secondary">
            Size: <strong className="text-navy">{size ?? 'choose one'}</strong>
          </legend>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {product.sizes.map((s) => {
              const on = size === s;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setSize(s);
                    setHint(null);
                  }}
                  className={`h-12 rounded-lg border text-body-strong ${
                    on ? 'border-navy bg-navy text-text-on-navy' : 'border-border text-navy'
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      {hint ? (
        <p role="alert" className="mt-3 text-body-strong text-danger">
          {hint}
        </p>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-border bg-surface px-4 pt-3 pb-4">
        {added ? (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-body-strong text-green" role="status">
              Added to your cart
            </p>
            <Link
              href={`/${slug}/cart`}
              className="flex h-12 items-center gap-2 rounded-pill bg-primary px-5 text-button text-text-on-primary"
            >
              View cart <ArrowRightIcon size={18} aria-hidden="true" />
            </Link>
          </div>
        ) : soldOut || !canOrder ? (
          <p className="flex h-12 items-center justify-center rounded-pill bg-surface-muted text-body-strong text-text-secondary">
            {soldOut ? 'Sold out' : blockedReason}
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex h-12 items-center rounded-pill border border-border">
              <button
                type="button"
                aria-label="One less"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="flex size-12 items-center justify-center text-navy"
              >
                <MinusIcon size={20} aria-hidden="true" />
              </button>
              <span aria-live="polite" className="w-6 text-center text-subtitle text-navy">
                {qty}
              </span>
              <button
                type="button"
                aria-label="One more"
                onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))}
                className="flex size-12 items-center justify-center text-navy"
              >
                <PlusIcon size={20} aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              onClick={addToCart}
              className="h-12 flex-1 rounded-pill bg-primary text-button text-text-on-primary"
            >
              Add to cart · {formatKsh(product.price * qty)}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
