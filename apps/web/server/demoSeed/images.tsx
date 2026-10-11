// Original placeholder photos for the demo shop (owner Step 63: no stock or downloaded
// photos): a solid colour, a simple drawn shape and the product's name, drawn with next/og.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import type { DemoProduct } from './data';

const NAVY = '#1C1A2E';

const SHAPES: Record<DemoProduct['shape'], string> = {
  dress: 'M80 20 L120 20 L130 60 L165 180 L35 180 L70 60 Z',
  top: 'M60 30 L85 20 L115 20 L140 30 L175 60 L155 85 L140 75 L140 180 L60 180 L60 75 L45 85 L25 60 Z',
  shoe: 'M20 140 L20 110 Q60 110 90 90 L110 100 Q150 120 180 130 L180 160 L20 160 Z',
  bag: 'M45 75 L155 75 L170 180 L30 180 Z M75 75 Q75 30 100 30 Q125 30 125 75',
  ring: 'M100 40 A60 60 0 1 0 100.1 40 Z M100 70 A30 30 0 1 1 99.9 70 Z',
};

let fonts: Promise<Buffer[]> | undefined;
function loadFonts() {
  fonts ??= Promise.all(
    ['BricolageGrotesque_700Bold.ttf', 'Inter_500Medium.ttf'].map((f) =>
      readFile(join(process.cwd(), 'assets', 'fonts', f)),
    ),
  );
  return fonts;
}

/** A square PNG of `side` pixels. */
export async function placeholderPhoto(product: DemoProduct, side: number): Promise<Uint8Array> {
  const [bold] = await loadFonts();
  const scale = side / 400;
  const response = new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: product.colour,
        fontFamily: 'oda',
      }}
    >
      <svg width={200 * scale} height={200 * scale} viewBox="0 0 200 200">
        <path d={SHAPES[product.shape]} fill={NAVY} fillRule="evenodd" fillOpacity={0.85} />
      </svg>
      <div
        style={{
          display: 'flex',
          marginTop: 24 * scale,
          padding: `${8 * scale}px ${18 * scale}px`,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.75)',
          color: NAVY,
          fontSize: 22 * scale,
          fontWeight: 700,
        }}
      >
        {product.name}
      </div>
    </div>,
    {
      width: side,
      height: side,
      fonts: [{ name: 'oda', data: bold!, weight: 700, style: 'normal' }],
    },
  );
  return new Uint8Array(await response.arrayBuffer());
}
