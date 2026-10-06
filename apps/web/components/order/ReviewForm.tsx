'use client';

// The review form on /o/{token}/review (M7, web 5d, decision #73): big stars with a label, the
// four tags, and per item optional stars, text and one photo. Photos are resized in the
// browser (canvas, longest side 1280 px, re-encoded as JPEG so location data is dropped), then
// uploaded straight to storage with a signed URL from /api/o/:token/uploads; the server checks
// the stored bytes again when the review is saved. Within 7 days the same form edits it.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { RATING_LABELS, REVIEW_TAGS, REVIEW_TEXT_MAX } from '@oda/shared';

export interface ReviewFormItem {
  orderItemId: string;
  name: string;
  size: string | null;
  colour: string | null;
  coverUrl: string | null;
}

export interface ExistingReview {
  rating: number;
  tags: string[];
  items: {
    orderItemId: string;
    rating: number | null;
    text: string | null;
    photoKey: string | null;
    photoUrl: string | null;
  }[];
}

interface ItemState {
  rating: number | null;
  text: string;
  photoKey: string | null;
  photoUrl: string | null;
  uploading: boolean;
  error: string | null;
}

const MAX_SIDE = 1280;
const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';

/** Resizes a photo to at most 1280 px and re-encodes it as JPEG (drops EXIF/location). */
async function resizePhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('We can’t read this photo. Choose a JPEG or PNG photo.');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser can’t prepare photos. Try another browser.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.82),
  );
  if (!blob) throw new Error('We couldn’t prepare this photo. Try another one.');
  return blob;
}

async function errorMessage(res: Response): Promise<string> {
  const data = await res.json().catch(() => null);
  return data?.error?.message ?? 'Something went wrong. Please try again.';
}

function StarButtons({
  value,
  onChange,
  size,
  label,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  size: number;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`Rate ${n} out of 5`}
          onClick={() => onChange(value === n && size < 40 ? null : n)}
          className="flex min-h-11 min-w-11 items-center justify-center"
        >
          <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
            <path
              d={STAR_PATH}
              className={value !== null && n <= value ? 'fill-star' : 'fill-none stroke-border'}
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ))}
    </div>
  );
}

export function ReviewForm({
  token,
  shopName,
  shopInitials,
  shopLogoUrl,
  subtitle,
  displayName,
  items,
  existing,
  initialStars,
}: {
  token: string;
  shopName: string;
  shopInitials: string;
  shopLogoUrl: string | null;
  subtitle: string;
  displayName: string;
  items: ReviewFormItem[];
  existing: ExistingReview | null;
  initialStars: number | null;
}) {
  const router = useRouter();
  const [rating, setRating] = useState<number | null>(existing?.rating ?? initialStars);
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [state, setState] = useState<Record<string, ItemState>>(() =>
    Object.fromEntries(
      items.map((i) => {
        const e = existing?.items.find((x) => x.orderItemId === i.orderItemId);
        return [
          i.orderItemId,
          {
            rating: e?.rating ?? null,
            text: e?.text ?? '',
            photoKey: e?.photoKey ?? null,
            photoUrl: e?.photoUrl ?? null,
            uploading: false,
            error: null,
          },
        ];
      }),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const files = useRef<Record<string, HTMLInputElement | null>>({});

  const patch = (id: string, change: Partial<ItemState>) =>
    setState((s) => ({ ...s, [id]: { ...s[id]!, ...change } }));

  async function addPhoto(id: string, file: File) {
    patch(id, { uploading: true, error: null });
    try {
      const blob = await resizePhoto(file);
      const signed = await fetch(`/api/o/${token}/uploads`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contentType: 'image/jpeg', size: blob.size }),
      });
      if (!signed.ok) throw new Error(await errorMessage(signed));
      const upload = (await signed.json()) as {
        key: string;
        url: string;
        headers: Record<string, string>;
      };
      const put = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: blob });
      if (!put.ok) throw new Error('The photo didn’t upload. Check your connection and try again.');
      patch(id, { photoKey: upload.key, photoUrl: URL.createObjectURL(blob), uploading: false });
    } catch (e) {
      const message =
        e instanceof TypeError
          ? 'No connection. Check your internet and try again.'
          : (e as Error).message;
      patch(id, { uploading: false, error: message });
    }
  }

  const uploading = Object.values(state).some((s) => s.uploading);

  async function submit() {
    if (!rating || busy || uploading) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/o/${token}/review`, {
        method: existing ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          rating,
          tags,
          items: items.map((i) => {
            const s = state[i.orderItemId]!;
            return {
              orderItemId: i.orderItemId,
              rating: s.rating,
              text: s.text.trim() || null,
              photoKey: s.photoKey,
            };
          }),
        }),
      });
      if (!res.ok) {
        setError(await errorMessage(res));
        setBusy(false);
        return;
      }
      router.push(`/o/${token}`);
      router.refresh();
    } catch {
      setError('No connection. Check your internet and try again.');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-surface px-4 pt-6 pb-48">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-headline text-navy">
            {existing ? 'Edit your review' : 'Rate your order'}
          </h1>
          <p className="text-body text-text-secondary">{subtitle}</p>
        </div>
        <Link
          href={`/o/${token}`}
          aria-label="Close and go back to your order"
          className="flex size-12 shrink-0 items-center justify-center rounded-pill bg-surface-muted text-navy"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        </Link>
      </div>

      <section
        aria-labelledby="overall-title"
        className="mt-5 rounded-xl bg-peach px-4 py-5 text-center"
      >
        <p className="flex items-center justify-center gap-3 text-body text-navy">
          {shopLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- plain images (decision #59)
            <img src={shopLogoUrl} alt="" className="size-10 rounded-pill object-cover" />
          ) : (
            <span className="flex size-10 items-center justify-center rounded-pill bg-navy text-small font-semibold text-text-on-navy">
              {shopInitials}
            </span>
          )}
          {shopName}
        </p>
        <h2 id="overall-title" className="mt-3 text-title text-navy">
          How was your experience?
        </h2>
        <div className="mt-2 flex justify-center">
          <StarButtons value={rating} onChange={setRating} size={44} label="Your rating" />
        </div>
        <p aria-live="polite" className="mt-1 min-h-6 text-body-strong text-primary">
          {rating ? RATING_LABELS[rating - 1] : 'Tap the stars to rate'}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {REVIEW_TAGS.map((tag) => {
            const on = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                onClick={() => setTags((t) => (on ? t.filter((x) => x !== tag) : [...t, tag]))}
                className={`min-h-11 rounded-pill px-4 text-body ${
                  on
                    ? 'border-2 border-primary bg-surface font-semibold text-primary'
                    : 'border-2 border-transparent bg-surface text-navy'
                }`}
              >
                {on ? '✓ ' : ''}
                {tag}
              </button>
            );
          })}
        </div>
      </section>

      {items.length ? (
        <section aria-labelledby="items-title" className="mt-6">
          <h2
            id="items-title"
            className="text-small font-semibold tracking-wider text-text-secondary uppercase"
          >
            Rate the items
          </h2>
          <ul className="mt-3 space-y-3">
            {items.map((item) => {
              const s = state[item.orderItemId]!;
              const textId = `text-${item.orderItemId}`;
              return (
                <li key={item.orderItemId} className="rounded-xl border border-border p-3">
                  <div className="flex items-center gap-3">
                    <span className="size-14 shrink-0 overflow-hidden rounded-lg bg-beige">
                      {item.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- plain thumbnails
                        <img src={item.coverUrl} alt="" className="size-full object-cover" />
                      ) : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-strong text-navy">{item.name}</p>
                      {item.colour || item.size ? (
                        <p className="text-small text-text-secondary">
                          {[item.colour, item.size ? `Size ${item.size}` : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <StarButtons
                      value={s.rating}
                      onChange={(n) => patch(item.orderItemId, { rating: n })}
                      size={26}
                      label={`Your rating for ${item.name}`}
                    />
                    {s.rating === null ? (
                      <span className="text-small text-text-secondary">Optional</span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-start gap-3">
                    <label htmlFor={textId} className="sr-only">
                      What did you think of {item.name}?
                    </label>
                    <textarea
                      id={textId}
                      value={s.text}
                      maxLength={REVIEW_TEXT_MAX}
                      rows={3}
                      placeholder="What did you think? (optional)"
                      onChange={(e) => patch(item.orderItemId, { text: e.target.value })}
                      className="min-h-24 flex-1 rounded-lg border border-border p-3 text-body text-navy focus:border-primary focus:outline-none"
                    />
                    {s.photoUrl ? (
                      <div className="relative size-24 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                        <img
                          src={s.photoUrl}
                          alt={`Your photo of ${item.name}`}
                          className="size-full rounded-lg object-cover"
                        />
                        <button
                          type="button"
                          aria-label={`Remove the photo of ${item.name}`}
                          onClick={() =>
                            patch(item.orderItemId, { photoKey: null, photoUrl: null })
                          }
                          className="absolute -top-2 -right-2 flex size-11 items-center justify-center"
                        >
                          <span className="flex size-7 items-center justify-center rounded-pill bg-navy text-small text-text-on-navy">
                            ✕
                          </span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {!s.photoUrl ? (
                    <>
                      <input
                        ref={(el) => {
                          files.current[item.orderItemId] = el;
                        }}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        tabIndex={-1}
                        aria-hidden="true"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) void addPhoto(item.orderItemId, file);
                        }}
                      />
                      <button
                        type="button"
                        disabled={s.uploading}
                        aria-label={s.uploading ? undefined : `Add a photo of ${item.name}`}
                        onClick={() => files.current[item.orderItemId]?.click()}
                        className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-text-muted px-4 text-body text-text-secondary disabled:opacity-60"
                      >
                        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                          <path
                            d="M4 8h3l2-2h6l2 2h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {s.uploading ? 'Adding photo…' : 'Add photo'}
                      </button>
                    </>
                  ) : null}
                  {s.error ? (
                    <p role="alert" className="mt-2 text-small text-danger">
                      {s.error}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface">
        <div className="mx-auto max-w-md px-4 pt-3 pb-4">
          {error ? (
            <p role="alert" className="mb-2 text-body text-danger">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={submit}
            disabled={!rating || busy || uploading}
            className="flex h-14 w-full items-center justify-center rounded-pill bg-primary text-button text-text-on-primary disabled:opacity-50"
          >
            {busy ? 'Saving…' : existing ? 'Save changes' : 'Submit review'}
          </button>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-small text-text-secondary">
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              aria-hidden="true"
              className="text-green"
            >
              <path
                d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6zM8.5 12l2.5 2.5 4.5-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
            Shows as <span className="font-semibold text-navy">{displayName}</span> · Verified buyer
          </p>
        </div>
      </div>
    </main>
  );
}
