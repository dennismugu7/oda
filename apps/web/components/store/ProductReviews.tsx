'use client';

// A product's reviews on its page (M7, web 02, decision #73): the shown name ("Wanjiku M. ·
// Verified buyer"), the overall stars, this product's text and photo (none once the seller
// reported the review), tags and the seller's reply. The first page comes from the server;
// "See more reviews" loads the next 20.
import { useState } from 'react';

export interface PublicReview {
  id: string;
  buyerDisplayName: string;
  rating: number;
  itemRating: number | null;
  text: string | null;
  photoUrl: string | null;
  tags: string[];
  sellerReply: string | null;
  createdAt: string | Date;
}

const dateLabel = (at: string | Date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(at));

export function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <span role="img" aria-label={`${rating} out of 5 stars`} className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
          <path
            d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"
            className={n <= rating ? 'fill-star' : 'fill-track'}
          />
        </svg>
      ))}
    </span>
  );
}

function ReviewCard({ review, shopName }: { review: PublicReview; shopName: string }) {
  const [zoom, setZoom] = useState(false);
  return (
    <li className="py-4">
      <div className="flex items-center justify-between gap-3">
        {/* This product's stars when the buyer rated it, otherwise the order's. */}
        <Stars rating={review.itemRating ?? review.rating} />
        <span className="text-small text-text-secondary">{dateLabel(review.createdAt)}</span>
      </div>
      <p className="mt-1 text-small text-text-secondary">
        <span className="font-semibold text-navy">{review.buyerDisplayName}</span> · Verified buyer
      </p>
      {review.text ? <p className="mt-2 text-body text-navy">{review.text}</p> : null}
      {review.photoUrl ? (
        <button
          type="button"
          onClick={() => setZoom((z) => !z)}
          aria-label={zoom ? 'Show the photo smaller' : 'Show the photo bigger'}
          className="mt-3 block overflow-hidden rounded-lg bg-beige"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- plain images (decision #59) */}
          <img
            src={review.photoUrl}
            alt={`Photo from ${review.buyerDisplayName}`}
            loading="lazy"
            className={zoom ? 'w-full object-contain' : 'size-24 object-cover'}
          />
        </button>
      ) : null}
      {review.tags.length ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {review.tags.map((tag) => (
            <li
              key={tag}
              className="rounded-pill bg-surface-muted px-3 py-1 text-small text-text-secondary"
            >
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
      {review.sellerReply ? (
        <div className="mt-3 rounded-lg bg-background p-3">
          <p className="text-small font-semibold text-navy">Reply from {shopName}</p>
          <p className="mt-1 text-body text-text-secondary">{review.sellerReply}</p>
        </div>
      ) : null}
    </li>
  );
}

export function ProductReviews({
  slug,
  productId,
  shopName,
  ratingAvg,
  ratingCount,
  initial,
  initialNext,
}: {
  slug: string;
  productId: string;
  shopName: string;
  ratingAvg: number | null;
  ratingCount: number;
  initial: PublicReview[];
  initialNext: string | null;
}) {
  const [reviews, setReviews] = useState(initial);
  const [next, setNext] = useState(initialNext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function more() {
    if (!next || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/shops/${slug}/products/${productId}/reviews?cursor=${encodeURIComponent(next)}`,
      );
      if (!res.ok) throw new Error('failed');
      const data = (await res.json()) as { reviews: PublicReview[]; next: string | null };
      setReviews((r) => [...r, ...data.reviews.filter((x) => !r.some((y) => y.id === x.id))]);
      setNext(data.next);
    } catch {
      setError('Couldn’t load more reviews. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  if (reviews.length === 0) return null;
  return (
    <section id="reviews" aria-labelledby="reviews-title" className="mt-6 scroll-mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="reviews-title" className="text-title text-navy">
          Reviews
        </h2>
        {ratingAvg !== null && ratingCount > 0 ? (
          <p className="text-body text-text-secondary">
            <span className="text-star">★</span>{' '}
            <span className="font-semibold text-navy">{ratingAvg.toFixed(1)}</span> · {ratingCount}{' '}
            {ratingCount === 1 ? 'rating' : 'ratings'}
          </p>
        ) : null}
      </div>
      <ul className="divide-y divide-border">
        {reviews.map((r) => (
          <ReviewCard key={r.id} review={r} shopName={shopName} />
        ))}
      </ul>
      {error ? (
        <p role="alert" className="mt-2 text-body text-danger">
          {error}
        </p>
      ) : null}
      {next ? (
        <button
          type="button"
          onClick={more}
          disabled={loading}
          className="mt-2 flex h-12 w-full items-center justify-center rounded-pill border border-border text-button text-navy disabled:opacity-60"
        >
          {loading ? 'Loading…' : 'See more reviews'}
        </button>
      ) : null}
    </section>
  );
}
