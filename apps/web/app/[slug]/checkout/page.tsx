// Checkout (web 4-checkout-details, with design-changes: 2 Delivery as a radio list with an
// address, 3 Payment as radios per the shop's settings, "Place order · KSh x"). The page gives
// the client the shop's delivery and payment options; prices come from the server's quote and
// the order is priced again when it's placed.
import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckoutForm } from '@/components/store/CheckoutForm';
import { loadShop, restOf, shopData, takingOrders } from '@/server/storefront';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const shop = await loadShop((await params).slug, restOf('/checkout', await searchParams));
  return { title: `Checkout · ${shop.name}`, robots: { index: false } };
}

export default async function Checkout({ params, searchParams }: Props) {
  const { slug } = await params;
  const shop = await loadShop(slug, restOf('/checkout', await searchParams));
  const areas = await shopData(shop).deliveryAreas();
  const canOrder = takingOrders(shop);

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-surface px-4 pt-5 pb-48">
      <div className="flex items-center gap-3">
        <Link
          href={`/${shop.slug}/cart`}
          aria-label="Back to your cart"
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
        <h1 className="flex-1 text-headline text-navy">Checkout</h1>
        <span className="flex items-center gap-1 text-body-strong text-green">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor" />
            <path d="M8 10V7a4 4 0 018 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          Secure
        </span>
      </div>

      {canOrder ? (
        <CheckoutForm
          shopId={shop.id}
          slug={shop.slug}
          shopName={shop.name}
          areas={areas.map((a) => ({
            id: a.id,
            name: a.name,
            fee: a.fee,
            etaLabel: a.etaLabel,
          }))}
          pickup={
            shop.pickupEnabled ? { location: shop.pickupLocation, hours: shop.pickupHours } : null
          }
          payNow={shop.payNowAvailable}
          payOnDelivery={shop.acceptsPayOnDelivery}
        />
      ) : (
        <div className="mt-8 rounded-xl bg-warning-tint p-6 text-center">
          <p className="text-title text-warning-text-strong">
            {shop.isPaused ? `${shop.name} is taking a break` : 'Not taking orders yet'}
          </p>
          <p className="mt-1 text-body text-warning-text-strong">
            You can still look around and chat with the seller.
          </p>
          <Link
            href={`/${shop.slug}`}
            className="mt-5 inline-flex h-12 items-center rounded-pill bg-primary px-6 text-button text-text-on-primary"
          >
            Back to the shop
          </Link>
        </div>
      )}
    </main>
  );
}
