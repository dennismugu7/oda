'use client';

// Cart (web 03, with design-changes: no stock wording; the free-delivery banner only with a
// threshold; delivery "Calculated at checkout"). The lines live on this device; on open the
// cart asks the server for current prices and statuses (POST /api/shops/:slug/cart) and flags
// anything sold out, gone or repriced, blocking checkout until it's resolved (spec §6.3).
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { formatKes } from '@oda/shared';
import { cartCount, cartTotal, type CartLine } from '@/lib/store/cart';
import { reconcile, type CurrentProduct } from '@/lib/store/reconcile';
import { useCart } from './useShopStore';
import { SafeImg } from '@/components/SafeImg';

export interface Suggestion {
  id: string;
  name: string;
  price: number;
  categoryId: string | null;
  hasOptions: boolean;
  coverUrl: string | null;
}

export function CartView({
  shopId,
  slug,
  shopName,
  freeDeliveryThreshold,
  canOrder,
  blockedReason,
  suggestions,
}: {
  shopId: string;
  slug: string;
  shopName: string;
  freeDeliveryThreshold: number | null;
  canOrder: boolean;
  blockedReason: string;
  suggestions: Suggestion[];
}) {
  const { lines, add, changeQty, replace, hydrated } = useCart(shopId);
  // The latest server check, and the products it was for.
  const [result, setResult] = useState<{ ids: string; map: Map<string, CurrentProduct> } | null>(
    null,
  );
  const [failedIds, setFailedIds] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const ids = useMemo(() => [...new Set(lines.map((l) => l.productId))].sort().join(','), [lines]);
  const current = result?.map ?? null;
  const checkFailed = !!ids && failedIds === ids;
  const checking = !!ids && hydrated && result?.ids !== ids && !checkFailed;

  useEffect(() => {
    if (!ids) return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    fetch(`/api/shops/${slug}/cart`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productIds: ids.split(',') }),
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { products: CurrentProduct[] }) => {
        if (cancelled) return;
        setResult({ ids, map: new Map(body.products.map((p) => [p.id, p])) });
        setFailedIds(null);
      })
      .catch(() => !cancelled && setFailedIds(ids))
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [ids, slug, attempt]);

  function retryCheck() {
    setFailedIds(null);
    setAttempt((n) => n + 1);
  }

  /**
   * Changes a line's quantity; when that removes the line, focus moves to the next line's
   * remove button (or the one before it), or to the page heading once the cart is empty.
   */
  function setLineQty(index: number, qty: number) {
    changeQty(index, qty);
    if (qty >= 1) return;
    requestAnimationFrame(() => {
      const buttons = document.querySelectorAll<HTMLElement>('[data-cart-remove]');
      const next = buttons[Math.min(index, buttons.length - 1)];
      (next ?? document.getElementById('cart-title'))?.focus();
    });
  }

  const checked = current ? reconcile(lines, current) : null;
  const problems = checked?.filter((c) => c.problem) ?? [];
  const subtotal = cartTotal(checked ? checked.map((c) => c.line) : lines);
  const count = cartCount(lines);
  // Categories already in the cart: from the server check, or from the suggestions list.
  const inCartCategories = new Set(
    lines
      .map(
        (l) =>
          current?.get(l.productId)?.categoryId ??
          suggestions.find((s) => s.id === l.productId)?.categoryId,
      )
      .filter(Boolean),
  );
  const goesWell = suggestions
    .filter((s) => !lines.some((l) => l.productId === s.id))
    .filter((s) => !s.categoryId || !inCartCategories.has(s.categoryId))
    .slice(0, 2);

  // The cart lives on this device: until it's read, show a placeholder, not "empty".
  if (!hydrated) {
    return (
      <div className="mt-4 animate-pulse" aria-busy="true">
        <p role="status" className="sr-only">
          Loading…
        </p>
        {[0, 1].map((n) => (
          <div key={n} className="flex gap-4 py-4">
            <div className="size-24 shrink-0 rounded-xl bg-surface-muted" />
            <div className="flex-1 space-y-3 pt-1">
              <div className="h-5 w-3/4 rounded bg-surface-muted" />
              <div className="h-4 w-1/3 rounded bg-surface-muted" />
              <div className="h-11 rounded-pill bg-surface-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (count === 0) {
    return (
      <div className="mt-10 rounded-xl bg-background p-8 text-center">
        <p className="text-title text-navy">Your cart is empty</p>
        <p className="mt-1 text-body text-text-secondary">
          Add something you like from {shopName}.
        </p>
        <Link
          href={`/${slug}`}
          className="mt-5 inline-flex h-12 items-center rounded-pill bg-primary px-6 text-button text-text-on-primary"
        >
          Keep shopping
        </Link>
      </div>
    );
  }

  return (
    <>
      {freeDeliveryThreshold ? (
        <div className="mt-4 rounded-xl bg-green-tint p-4">
          <p className="text-body text-green">
            {subtotal >= freeDeliveryThreshold ? (
              <strong>You’ve unlocked free delivery</strong>
            ) : (
              <>
                Add <strong>{formatKes(freeDeliveryThreshold - subtotal)}</strong> more for free
                delivery
              </>
            )}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-pill bg-surface" aria-hidden="true">
            <div
              className="h-full rounded-pill bg-green"
              style={{ width: `${Math.min(100, (subtotal / freeDeliveryThreshold) * 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      {checkFailed ? (
        <div
          role="status"
          className="mt-4 rounded-lg bg-warning-tint p-3 text-body text-warning-text-strong"
        >
          <p>We couldn’t check the latest prices. They’ll be checked again at checkout.</p>
          <button
            type="button"
            onClick={retryCheck}
            className="inline-flex min-h-11 items-center font-semibold underline"
          >
            Try again
          </button>
        </div>
      ) : checking ? (
        <p role="status" className="mt-4 text-small text-text-secondary">
          Checking prices…
        </p>
      ) : null}

      <ul className="mt-4 divide-y divide-border">
        {(checked ?? lines.map((line) => ({ line, problem: null, index: 0 }))).map((c, i) => (
          <li
            key={`${c.line.productId}-${c.line.size}-${c.line.colour}`}
            className="flex gap-4 py-4"
          >
            <Link
              href={`/${slug}/p/${c.line.productId}`}
              // The product name next to it is the same link: one stop for keyboards and
              // screen readers.
              aria-hidden="true"
              tabIndex={-1}
              className="size-24 shrink-0 overflow-hidden rounded-xl bg-beige"
            >
              {c.line.coverUrl ? (
                <SafeImg
                  src={c.line.coverUrl}
                  alt=""
                  width={96}
                  height={96}
                  className="size-full object-cover"
                />
              ) : null}
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-subtitle text-navy">{c.line.name}</p>
                <button
                  type="button"
                  aria-label={`Remove ${c.line.name}`}
                  data-cart-remove=""
                  onClick={() => setLineQty(i, 0)}
                  className="-mt-1 -mr-2 flex size-11 items-center justify-center text-text-secondary"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path
                      d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
              {c.line.colour || c.line.size ? (
                <p className="text-body text-text-secondary">
                  {[c.line.colour, c.line.size ? `Size ${c.line.size}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              ) : null}
              {c.problem ? (
                <p role="alert" className="mt-1 text-body-strong text-danger">
                  {c.problem}
                </p>
              ) : null}
              <div className="mt-2 flex items-center justify-between">
                <p className="text-subtitle font-bold text-navy">{formatKes(c.line.price)}</p>
                <div className="flex h-11 items-center rounded-pill border border-border">
                  <button
                    type="button"
                    aria-label={`One less ${c.line.name}`}
                    onClick={() => setLineQty(i, c.line.qty - 1)}
                    className="size-11 text-title text-navy"
                  >
                    −
                  </button>
                  <span aria-live="polite" className="w-6 text-center text-body-strong text-navy">
                    <span className="sr-only">Quantity </span>
                    {c.line.qty}
                  </span>
                  <button
                    type="button"
                    aria-label={`One more ${c.line.name}`}
                    onClick={() => setLineQty(i, c.line.qty + 1)}
                    className="size-11 text-title text-navy"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {problems.length ? (
        <button
          type="button"
          onClick={() => replace(checked!.filter((c) => !c.remove).map((c) => c.line))}
          className="mt-2 h-11 w-full rounded-pill border border-navy text-body-strong text-navy"
        >
          Update my cart
        </button>
      ) : null}

      {goesWell.length ? (
        <section className="mt-6">
          <h2 className="text-title text-navy">Goes well with</h2>
          <ul className="mt-3 space-y-3">
            {goesWell.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-xl bg-background p-3">
                <Link
                  href={`/${slug}/p/${s.id}`}
                  aria-label={s.name}
                  className="size-16 shrink-0 overflow-hidden rounded-lg bg-beige"
                >
                  {s.coverUrl ? (
                    <SafeImg
                      src={s.coverUrl}
                      alt=""
                      width={64}
                      height={64}
                      className="size-full object-cover"
                    />
                  ) : null}
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body text-navy">{s.name}</p>
                  <p className="text-body-strong text-navy">{formatKes(s.price)}</p>
                </div>
                {s.hasOptions ? (
                  <Link
                    href={`/${slug}/p/${s.id}`}
                    className="flex h-11 items-center rounded-pill border border-primary px-4 text-body-strong text-primary"
                  >
                    Choose
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      add({
                        productId: s.id,
                        size: null,
                        colour: null,
                        qty: 1,
                        price: s.price,
                        name: s.name,
                        coverUrl: s.coverUrl,
                      })
                    }
                    className="flex h-11 items-center rounded-pill border border-primary px-4 text-body-strong text-primary"
                  >
                    + Add
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <dl className="mt-6 space-y-2 text-body">
        <div className="flex justify-between">
          <dt className="text-text-secondary">Subtotal</dt>
          <dd className="text-body-strong text-navy">{formatKes(subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-secondary">Delivery</dt>
          <dd className="text-text-secondary">Calculated at checkout</dd>
        </div>
      </dl>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-border bg-surface px-4 pt-3 pb-4">
        <div className="flex items-baseline justify-between">
          <span className="text-body text-text-secondary">Total</span>
          <span className="text-headline text-navy">{formatKes(subtotal)}</span>
        </div>
        {canOrder && !problems.length ? (
          <Link
            href={`/${slug}/checkout`}
            className="mt-3 flex h-14 items-center justify-center rounded-pill bg-primary text-button text-text-on-primary"
          >
            Checkout
          </Link>
        ) : (
          <p
            aria-disabled="true"
            className="mt-3 flex h-14 items-center justify-center rounded-pill bg-surface-muted text-button text-text-secondary"
          >
            {!canOrder ? blockedReason : 'Update your cart to continue'}
          </p>
        )}
        <p className="mt-2 text-center text-small text-text-secondary">
          No account needed · Pay the seller directly on M-Pesa
        </p>
      </div>
    </>
  );
}

export type { CartLine };
