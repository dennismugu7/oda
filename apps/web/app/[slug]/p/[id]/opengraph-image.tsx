// A product's link-preview image (spec §4: title, price, cover image): the cover photo on the
// left; the name, price (and was-price), shop and link on navy. 1200 × 630, next/og.
import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';
import { formatKsh } from '@oda/shared';
import { colors } from '@oda/ui-tokens';
import { HttpError } from '@/server/errors';
import {
  linkFontSize,
  loadShop,
  PREVIEW_FONT,
  previewFonts,
  shopData,
  shopLink,
} from '@/server/storefront';

export const alt = 'A product on oda';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const shop = await loadShop(slug);
  let product;
  try {
    product = await shopData(shop).product(id);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
  const cover = product.photos[0]?.url ?? null;
  const link = shopLink(shop.slug).replace(/^https?:\/\//, '');

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: colors.navy,
        fontFamily: PREVIEW_FONT,
      }}
    >
      <div style={{ display: 'flex', width: 630, height: 630, background: colors.beige }}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- next/og draws plain <img>
          <img src={cover} alt="" width={630} height={630} style={{ objectFit: 'cover' }} />
        ) : null}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 56,
          width: 570,
        }}
      >
        <div style={{ display: 'flex', fontSize: 38, fontWeight: 700, color: '#fff' }}>
          oda<span style={{ color: colors.greenBright }}>.</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              display: 'flex',
              fontSize: product.name.length > 24 ? 44 : 54,
              fontWeight: 700,
              color: '#fff',
              lineHeight: 1.1,
              letterSpacing: -1.5,
            }}
          >
            {product.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
            <span style={{ fontSize: 48, fontWeight: 700, color: '#fff' }}>
              {formatKsh(product.price)}
            </span>
            {product.compareAtPrice ? (
              <span
                style={{
                  fontSize: 30,
                  fontWeight: 500,
                  color: colors.toggleOff,
                  textDecoration: 'line-through',
                }}
              >
                {formatKsh(product.compareAtPrice)}
              </span>
            ) : null}
          </div>
          <div style={{ display: 'flex', fontSize: 28, fontWeight: 500, color: colors.toggleOff }}>
            {product.status === 'sold_out' ? 'Sold out · ' : ''}
            {shop.name}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            fontSize: linkFontSize(link, 410),
            fontWeight: 500,
            color: '#fff',
            background: colors.navyRaised,
            borderRadius: 999,
            padding: '12px 24px',
            whiteSpace: 'nowrap',
          }}
        >
          {link}
        </div>
      </div>
    </div>,
    { ...size, fonts: await previewFonts() },
  );
}
