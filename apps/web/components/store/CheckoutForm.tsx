'use client';

// Checkout (web 4-checkout-details, changed; spec §6.4). The cart lives on this device; the
// server prices it (POST /api/shops/:slug/quote) and prices it again when the order is placed
// (POST /api/shops/:slug/orders). A price that changed since the buyer added it blocks the
// order until they accept the new one. One idempotency key per attempt: a retry after a lost
// connection returns the same order, a double tap places one.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatKes, normalizeKePhone } from '@oda/shared';
import { cartCount, readSource, writeSource, type CartLine } from '@/lib/store/cart';
import { useCart } from './useShopStore';

export interface CheckoutArea {
  id: string;
  name: string;
  fee: number;
  etaLabel: string | null;
}

interface QuoteLine {
  productId: string;
  size: string | null;
  colour: string | null;
  name: string;
  unitPrice: number;
  qty: number;
}

interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  options: {
    kind: 'delivery' | 'pickup';
    areaId: string | null;
    deliveryFee: number;
    total: number;
    freeDeliveryApplied: boolean;
  }[];
}

type Payment = 'pay_now' | 'pay_on_delivery';
type Errors = Partial<
  Record<'name' | 'phone' | 'email' | 'choice' | 'address' | 'payment', string>
>;

/** Works on plain-http pages too (crypto.randomUUID needs a secure context). */
function newKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const sameLine = (a: Pick<CartLine, 'productId' | 'size' | 'colour'>, b: typeof a) =>
  a.productId === b.productId && a.size === b.size && a.colour === b.colour;

const FIELD_OF: Record<string, keyof Errors> = {
  'buyer.name': 'name',
  'buyer.phone': 'phone',
  'buyer.email': 'email',
  'fulfilment.areaId': 'choice',
  'fulfilment.addressText': 'address',
  addressText: 'address',
  payment: 'payment',
};

export function CheckoutForm({
  shopId,
  slug,
  shopName,
  areas,
  pickup,
  payNow,
  payOnDelivery,
}: {
  shopId: string;
  slug: string;
  shopName: string;
  areas: CheckoutArea[];
  pickup: { location: string | null; hours: string | null } | null;
  payNow: boolean;
  payOnDelivery: boolean;
}) {
  const router = useRouter();
  const { lines, replace } = useCart(shopId);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState(true);
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState('');
  const onlyChoice = areas.length + (pickup ? 1 : 0) === 1;
  const [choice, setChoice] = useState<string | null>(
    onlyChoice ? (areas[0]?.id ?? 'pickup') : null,
  );
  const [address, setAddress] = useState('');
  const [payment, setPayment] = useState<Payment | null>(
    payNow && !payOnDelivery ? 'pay_now' : !payNow && payOnDelivery ? 'pay_on_delivery' : null,
  );
  const [website, setWebsite] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<{ message: string; toCart?: boolean } | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<{ message: string; toCart: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState(false);
  const key = useRef<string | null>(null);
  /** Editing a field clears its message. */
  const fix = (k: keyof Errors) =>
    setErrors((e) => {
      if (!e[k]) return e;
      const rest = { ...e };
      delete rest[k];
      return rest;
    });
  // A double tap lands before React re-renders the disabled button.
  const inFlight = useRef(false);

  // Re-quote whenever the lines (or their prices) change.
  const linesKey = useMemo(
    () => JSON.stringify(lines.map((l) => [l.productId, l.size, l.colour, l.qty, l.price])),
    [lines],
  );
  useEffect(() => {
    if (placed || lines.length === 0) return;
    let cancelled = false;
    fetch(`/api/shops/${slug}/quote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lines: lines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          size: l.size,
          colour: l.colour,
        })),
      }),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok) {
          setQuote(body as Quote);
          setQuoteError(null);
          return;
        }
        const code = body?.error?.code as string | undefined;
        const toCart = res.status === 409 || res.status === 422 || res.status === 404;
        setQuoteError({
          message:
            code === 'item_unavailable'
              ? 'Something in your cart is no longer available.'
              : toCart
                ? (body?.error?.message ?? 'Something in your cart changed.')
                : 'We couldn’t load the prices. Check your connection and try again.',
          toCart,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setQuoteError({
            message: 'We couldn’t load the prices. Check your connection and try again.',
            toCart: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
    // linesKey stands for `lines`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesKey, slug, placed]);

  // Lines whose price changed since the buyer added them (spec §6.3: block until resolved).
  const changed = useMemo(() => {
    if (!quote) return [];
    return quote.lines.flatMap((q) => {
      const line = lines.find((l) => sameLine(l, q));
      return line && line.price !== q.unitPrice ? [{ line, now: q.unitPrice, name: q.name }] : [];
    });
  }, [quote, lines]);

  const option = quote?.options.find((o) =>
    choice === 'pickup' ? o.kind === 'pickup' : o.areaId === choice,
  );
  const subtotal = quote?.subtotal ?? lines.reduce((n, l) => n + l.qty * l.price, 0);
  const count = cartCount(lines);

  function acceptNewPrices() {
    if (!quote) return;
    replace(
      lines.map((l) => {
        const q = quote.lines.find((x) => sameLine(l, x));
        return q ? { ...l, price: q.unitPrice, name: q.name } : l;
      }),
    );
  }

  function validate(): Errors {
    const e: Errors = {};
    if (name.trim().length < 2) e.name = 'Enter your name.';
    if (!normalizeKePhone(phone)) e.phone = 'Enter a Kenyan mobile number, e.g. 0712 345 678.';
    if (showEmail && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      e.email = 'Check the email address.';
    }
    if (!choice)
      e.choice = pickup && areas.length ? 'Choose delivery or pickup.' : 'Choose where to deliver.';
    if (choice && choice !== 'pickup' && address.trim().length < 3) {
      e.address = 'Enter the delivery address.';
    }
    if (!payment) e.payment = 'Choose how you’ll pay.';
    return e;
  }

  async function placeOrder(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || !quote || !option || changed.length) return;
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) {
      document.getElementById(`checkout-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    key.current ??= newKey();
    setSubmitting(true);
    let res: Response;
    try {
      res = await fetch(`/api/shops/${slug}/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: key.current,
          buyer: {
            name,
            phone,
            whatsapp,
            email: showEmail ? email : null,
          },
          fulfilment:
            choice === 'pickup'
              ? { kind: 'pickup' }
              : { kind: 'delivery', areaId: choice, addressText: address },
          payment,
          lines: lines.map((l) => ({
            productId: l.productId,
            qty: l.qty,
            size: l.size,
            colour: l.colour,
          })),
          expectedTotal: option.total,
          source: readSource(shopId),
          ...(website ? { website } : {}),
        }),
      });
    } catch {
      // Keep the key: if the order did go through, trying again returns it.
      inFlight.current = false;
      setSubmitting(false);
      setFormError({ message: 'No connection. Check your internet and tap Place order again.' });
      return;
    }
    const body = await res.json().catch(() => null);
    if (res.ok && body?.token) {
      setPlaced(true);
      writeSource(shopId, null);
      replace([]);
      router.replace(`/o/${body.token}`);
      return;
    }
    // Nothing was created: the next attempt is a new one.
    key.current = null;
    inFlight.current = false;
    setSubmitting(false);
    const error = body?.error as
      | { code?: string; message?: string; fields?: Record<string, string>; details?: Quote }
      | undefined;
    if (error?.code === 'price_changed' && error.details) {
      setQuote((q) => (q ? { ...q, lines: error.details!.lines } : q));
      return;
    }
    if (error?.fields) {
      const mapped: Errors = {};
      for (const [field, message] of Object.entries(error.fields)) {
        const k = FIELD_OF[field];
        if (k) mapped[k] ??= message;
      }
      setErrors(mapped);
    }
    setFormError({
      message: error?.message ?? 'Something went wrong. Please try again.',
      toCart: error?.code === 'item_unavailable',
    });
  }

  if (placed) {
    return (
      <p role="status" className="mt-10 text-center text-body text-text-secondary">
        Opening your order…
      </p>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="mt-10 rounded-xl bg-background p-8 text-center">
        <p className="text-title text-navy">Your cart is empty</p>
        <p className="mt-1 text-body text-text-secondary">Add something from {shopName} first.</p>
        <Link
          href={`/${slug}`}
          className="mt-5 inline-flex h-12 items-center rounded-pill bg-primary px-6 text-button text-text-on-primary"
        >
          Keep shopping
        </Link>
      </div>
    );
  }

  const inputClass = (bad?: string) =>
    `mt-1 h-12 w-full rounded-lg border bg-surface px-4 text-body text-text outline-none focus:border-navy focus:ring-2 focus:ring-navy/20 ${
      bad ? 'border-danger' : 'border-border'
    }`;
  const fieldError = (id: keyof Errors) =>
    errors[id] ? (
      <p id={`checkout-${id}-error`} className="mt-1 text-small font-semibold text-danger">
        {errors[id]}
      </p>
    ) : null;
  const described = (id: keyof Errors) =>
    errors[id] ? { 'aria-invalid': true, 'aria-describedby': `checkout-${id}-error` } : {};
  const blocked = !quote || !!quoteError || changed.length > 0;

  return (
    <form onSubmit={placeOrder} noValidate className="mt-5">
      <details className="rounded-xl bg-background">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3">
          <span className="flex -space-x-2" aria-hidden="true">
            {lines.slice(0, 3).map((l) => (
              <span
                key={`${l.productId}-${l.size}-${l.colour}`}
                className="size-10 overflow-hidden rounded-lg border-2 border-background bg-beige"
              >
                {l.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- plain thumbnails (decision #59)
                  <img
                    src={l.coverUrl}
                    alt=""
                    width={40}
                    height={40}
                    className="size-full object-cover"
                  />
                ) : null}
              </span>
            ))}
          </span>
          <span className="flex-1 text-body text-text-secondary">
            {count} {count === 1 ? 'item' : 'items'} ·{' '}
            <strong className="text-navy">{formatKes(subtotal)}</strong>
          </span>
          <span className="text-body-strong text-primary">Details</span>
        </summary>
        <ul className="divide-y divide-border px-4 pb-2">
          {lines.map((l) => (
            <li key={`${l.productId}-${l.size}-${l.colour}`} className="flex gap-3 py-2 text-body">
              <span className="flex-1 text-navy">
                {l.name}
                {l.colour || l.size ? (
                  <span className="block text-small text-text-secondary">
                    {[l.colour, l.size ? `Size ${l.size}` : null].filter(Boolean).join(' · ')}
                  </span>
                ) : null}
              </span>
              <span className="text-text-secondary">× {l.qty}</span>
              <span className="w-24 text-right text-body-strong text-navy">
                {formatKes(l.price * l.qty)}
              </span>
            </li>
          ))}
        </ul>
      </details>

      {quoteError ? (
        <div
          role="alert"
          className="mt-4 rounded-lg bg-warning-tint p-4 text-body text-warning-text-strong"
        >
          <p>{quoteError.message}</p>
          {quoteError.toCart ? (
            <Link href={`/${slug}/cart`} className="mt-2 inline-block font-semibold underline">
              Review your cart
            </Link>
          ) : null}
        </div>
      ) : null}

      {changed.length ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-warning-accent bg-warning-tint p-4"
        >
          <p className="text-body-strong text-warning-text-strong">
            Some prices changed since you added them
          </p>
          <ul className="mt-2 space-y-1 text-body text-warning-text-strong">
            {changed.map((c) => (
              <li key={`${c.line.productId}-${c.line.size}-${c.line.colour}`}>
                {c.name}: now <strong>{formatKes(c.now)}</strong> (was {formatKes(c.line.price)})
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={acceptNewPrices}
            className="mt-3 h-11 w-full rounded-pill bg-navy text-body-strong text-text-on-navy"
          >
            OK, use the new prices
          </button>
        </div>
      ) : null}

      <section aria-labelledby="details-title" className="mt-4 rounded-xl border border-border p-4">
        <h2 id="details-title" className="flex items-center gap-3 text-title text-navy">
          <span className="flex size-8 items-center justify-center rounded-pill bg-navy text-body-strong text-text-on-navy">
            1
          </span>
          Your details
        </h2>
        <label className="mt-4 block text-small text-text-secondary" htmlFor="checkout-name">
          Your name
        </label>
        <input
          id="checkout-name"
          autoComplete="name"
          maxLength={60}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            fix('name');
          }}
          className={inputClass(errors.name)}
          {...described('name')}
        />
        {fieldError('name')}
        <label className="mt-3 block text-small text-text-secondary" htmlFor="checkout-phone">
          Phone number
        </label>
        <div
          className={`mt-1 flex h-12 items-center rounded-lg border bg-surface focus-within:border-navy focus-within:ring-2 focus-within:ring-navy/20 ${
            errors.phone ? 'border-danger' : 'border-border'
          }`}
        >
          <span className="border-r border-border px-4 text-body text-text-secondary">+254</span>
          <input
            id="checkout-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="712 345 678"
            maxLength={20}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              fix('phone');
            }}
            className="h-full min-w-0 flex-1 bg-transparent px-4 text-body text-text outline-none placeholder:text-text-muted"
            {...described('phone')}
          />
        </div>
        {fieldError('phone')}
        <label className="mt-3 flex min-h-11 items-center gap-3 text-body text-navy">
          <input
            type="checkbox"
            checked={whatsapp}
            onChange={(e) => setWhatsapp(e.target.checked)}
            className="size-6 accent-green"
          />
          I use WhatsApp on this number
        </label>
        {showEmail ? (
          <>
            <label className="mt-2 block text-small text-text-secondary" htmlFor="checkout-email">
              Email for a receipt (optional)
            </label>
            <input
              id="checkout-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                fix('email');
              }}
              className={inputClass(errors.email)}
              {...described('email')}
            />
            {fieldError('email')}
          </>
        ) : (
          <button
            type="button"
            onClick={() => setShowEmail(true)}
            className="flex min-h-11 items-center gap-2 text-body-strong text-primary"
          >
            + Add email{' '}
            <span className="font-normal text-text-secondary">for a receipt (optional)</span>
          </button>
        )}
        <p className="mt-3 flex gap-2 border-t border-border pt-3 text-small text-text-secondary">
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          >
            <path
              d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          {shopName} will use these details only to contact you about this order.
        </p>
      </section>

      <fieldset className="mt-4 rounded-xl border border-border p-4" {...described('choice')}>
        <legend className="sr-only">Delivery</legend>
        <h2 aria-hidden="true" className="flex items-center gap-3 text-title text-navy">
          <span className="flex size-8 items-center justify-center rounded-pill bg-navy text-body-strong text-text-on-navy">
            2
          </span>
          Delivery
        </h2>
        <div className="mt-3 space-y-2">
          {areas.map((a) => {
            const o = quote?.options.find((x) => x.areaId === a.id);
            return (
              <Choice
                key={a.id}
                id={choice === null && a === areas[0] ? 'checkout-choice' : undefined}
                name="delivery"
                checked={choice === a.id}
                onChange={() => {
                  setChoice(a.id);
                  fix('choice');
                }}
                title={a.name}
                subtitle={a.etaLabel}
                right={
                  o ? (o.deliveryFee === 0 ? 'Free' : formatKes(o.deliveryFee)) : formatKes(a.fee)
                }
              />
            );
          })}
          {pickup ? (
            <Choice
              id={choice === null && areas.length === 0 ? 'checkout-choice' : undefined}
              name="delivery"
              checked={choice === 'pickup'}
              onChange={() => {
                setChoice('pickup');
                fix('choice');
                fix('address');
              }}
              title="Pickup"
              subtitle={[pickup.location, pickup.hours].filter(Boolean).join(' · ') || null}
              right="Free"
            />
          ) : null}
        </div>
        {fieldError('choice')}
        {choice && choice !== 'pickup' ? (
          <>
            <label className="mt-4 block text-small text-text-secondary" htmlFor="checkout-address">
              Area, street or building
            </label>
            <textarea
              id="checkout-address"
              rows={2}
              maxLength={300}
              autoComplete="street-address"
              placeholder="e.g. Rhapta Rd, Westlands, near Sarit"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                fix('address');
              }}
              className={`${inputClass(errors.address)} h-auto py-3`}
              {...described('address')}
            />
            {fieldError('address')}
          </>
        ) : null}
      </fieldset>

      <fieldset className="mt-4 rounded-xl border border-border p-4" {...described('payment')}>
        <legend className="sr-only">Payment</legend>
        <h2 aria-hidden="true" className="flex items-center gap-3 text-title text-navy">
          <span className="flex size-8 items-center justify-center rounded-pill bg-navy text-body-strong text-text-on-navy">
            3
          </span>
          Payment
        </h2>
        <div className="mt-3 space-y-2">
          {payNow ? (
            <Choice
              id={payment === null ? 'checkout-payment' : undefined}
              name="payment"
              checked={payment === 'pay_now'}
              onChange={() => {
                setPayment('pay_now');
                fix('payment');
              }}
              title="Pay now with M-Pesa"
              subtitle={`Pay ${shopName} directly. We’ll show you how next.`}
            />
          ) : null}
          {payOnDelivery ? (
            <Choice
              id={payment === null && !payNow ? 'checkout-payment' : undefined}
              name="payment"
              checked={payment === 'pay_on_delivery'}
              onChange={() => {
                setPayment('pay_on_delivery');
                fix('payment');
              }}
              title="Pay on delivery"
              subtitle={choice === 'pickup' ? 'Pay when you collect it.' : 'Pay when it arrives.'}
            />
          ) : null}
        </div>
        {fieldError('payment')}
      </fieldset>

      {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>

      <dl className="mt-6 space-y-2 text-body">
        <div className="flex justify-between">
          <dt className="text-text-secondary">Subtotal</dt>
          <dd className="text-body-strong text-navy">{formatKes(subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-secondary">{choice === 'pickup' ? 'Pickup' : 'Delivery'}</dt>
          <dd className={option ? 'text-body-strong text-navy' : 'text-text-secondary'}>
            {option
              ? option.deliveryFee === 0
                ? option.freeDeliveryApplied
                  ? 'Free delivery'
                  : 'Free'
                : formatKes(option.deliveryFee)
              : 'Choose an option'}
          </dd>
        </div>
      </dl>

      {formError ? (
        <div
          role="alert"
          className="mt-4 rounded-lg bg-warning-tint p-4 text-body text-warning-text-strong"
        >
          <p>{formError.message}</p>
          {formError.toCart ? (
            <Link href={`/${slug}/cart`} className="mt-2 inline-block font-semibold underline">
              Review your cart
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-border bg-surface px-4 pt-3 pb-4">
        <button
          type="submit"
          disabled={submitting || blocked}
          aria-disabled={submitting || blocked}
          className="flex h-14 w-full items-center justify-center rounded-pill bg-primary text-button text-text-on-primary disabled:bg-surface-muted disabled:text-text-secondary"
        >
          {submitting
            ? 'Placing your order…'
            : changed.length
              ? 'Check the new prices first'
              : !quote && !quoteError
                ? 'Loading prices…'
                : option
                  ? `Place order · ${formatKes(option.total)}`
                  : 'Place order'}
        </button>
        <p className="mt-2 text-center text-small text-text-secondary">
          No account needed · You pay the seller directly
        </p>
      </div>
    </form>
  );
}

function Choice({
  id,
  name,
  checked,
  onChange,
  title,
  subtitle,
  right,
}: {
  id?: string;
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  subtitle?: string | null;
  right?: string;
}) {
  return (
    <label
      className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 ${
        checked ? 'border-navy bg-background' : 'border-border'
      }`}
    >
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="size-5 shrink-0 accent-navy"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-body-strong text-navy">{title}</span>
        {subtitle ? <span className="block text-small text-text-secondary">{subtitle}</span> : null}
      </span>
      {right ? <span className="text-body-strong text-navy">{right}</span> : null}
    </label>
  );
}
