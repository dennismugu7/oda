// The shop's link-preview image (spec §4: WhatsApp, TikTok and Instagram show a rich
// preview). 1200 × 630, drawn on the server with next/og: the shop's name and link on navy,
// and up to three product covers. Fonts: Bricolage Grotesque and Inter from assets/fonts (OFL).
import { ImageResponse } from 'next/og';
import { colors } from '@oda/ui-tokens';
import {
  initials,
  linkFontSize,
  loadShop,
  PREVIEW_FONT,
  previewFonts,
  shopData,
  shopLink,
} from '@/server/storefront';

export const alt = 'A shop on oda';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function Photo({ src, width, height }: { src: string; width: number; height: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- next/og draws plain <img>
    <img
      src={src}
      alt=""
      width={width}
      height={height}
      style={{ objectFit: 'cover', borderRadius: 28, background: colors.beige }}
    />
  );
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await loadShop(slug);
  const products = (await shopData(shop).catalog()).filter((p) => p.coverUrl).slice(0, 3);
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
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 64,
          width: products.length ? 620 : 1200,
        }}
      >
        <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, color: '#fff' }}>
          oda<span style={{ color: colors.greenBright }}>.</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {products.length === 0 ? (
            <div
              style={{
                display: 'flex',
                width: 132,
                height: 132,
                borderRadius: 66,
                background: colors.primary,
                color: '#fff',
                fontSize: 56,
                fontWeight: 700,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {initials(shop.name)}
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              fontSize: shop.name.length > 18 ? 56 : 72,
              fontWeight: 700,
              color: '#fff',
              lineHeight: 1.05,
              letterSpacing: -2,
            }}
          >
            {shop.name}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: 30,
              fontWeight: 500,
              color: colors.toggleOff,
              whiteSpace: 'nowrap',
            }}
          >
            <span>Order in a few taps.</span>
            <span>Pay the seller on M-Pesa.</span>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            // One line always: long links get a smaller size (about 0.58 em per character).
            fontSize: linkFontSize(link, products.length ? 470 : 1000),
            fontWeight: 500,
            color: '#fff',
            background: colors.navyRaised,
            borderRadius: 999,
            padding: '14px 28px',
            whiteSpace: 'nowrap',
          }}
        >
          {link}
        </div>
      </div>
      {products.length ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            padding: '40px 40px 40px 0',
            width: 580,
          }}
        >
          {/* One photo: full height; two: stacked; three: one on top, two below. */}
          <Photo
            src={products[0]!.coverUrl!}
            width={540}
            height={products.length === 1 ? 550 : 267}
          />
          {products.length === 2 ? (
            <Photo src={products[1]!.coverUrl!} width={540} height={267} />
          ) : null}
          {products.length === 3 ? (
            <div style={{ display: 'flex', gap: 16 }}>
              <Photo src={products[1]!.coverUrl!} width={262} height={267} />
              <Photo src={products[2]!.coverUrl!} width={262} height={267} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>,
    {
      ...size,
      fonts: await previewFonts(),
    },
  );
}
