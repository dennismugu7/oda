// Redraws the app's launcher icon, adaptive-icon foreground and splash image in the brand
// colour from @oda/ui-tokens (M11 CP3, decision #88: primary darkened to #C44323 for AA
// contrast; the images still had the old #D94A27). Run from apps/seller:
//   node scripts/draw-brand-assets.mjs
// - adaptive-icon.png, splash-icon.png: white wordmark and green tick on transparency; only
//   the orange edge pixels change colour (alpha kept), white and green stay.
// - icon.png (legacy launcher icon): drawn fresh as a solid primary square with the
//   recoloured wordmark on top, at the size the old icon used (it also drops the lighter
//   rectangle the old image had behind the wordmark).
// Safe to re-run: the result only depends on the wordmark and the token.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { colors } from '@oda/ui-tokens/tokens';

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const hex = colors.primary;
const primary = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** True for the brand orange (old or new) and its anti-aliased edge: red well above green and blue. */
const isOrange = (r, g, b) => r - g > 60 && r - b > 60;

async function recolour(file) {
  const { data, info } = await sharp(join(assets, file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let changed = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0 && isOrange(data[i], data[i + 1], data[i + 2])) {
      [data[i], data[i + 1], data[i + 2]] = primary;
      changed++;
    }
  }
  const png = await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toBuffer();
  await sharp(png).toFile(join(assets, file));
  console.log(`${file}: ${changed} edge pixels recoloured to ${hex}`);
  return { png, info };
}

const foreground = await recolour('adaptive-icon.png');
await recolour('splash-icon.png');

// The old icon.png showed the wordmark 1.28 times larger than the adaptive foreground does.
const size = foreground.info.width;
const scaled = Math.round(size * 1.28);
const offset = Math.round((scaled - size) / 2);
const wordmark = await sharp(foreground.png)
  .resize(scaled, scaled)
  .extract({ left: offset, top: offset, width: size, height: size })
  .toBuffer();
await sharp({
  create: { width: size, height: size, channels: 4, background: hex },
})
  .composite([{ input: wordmark }])
  .flatten({ background: hex })
  .png({ compressionLevel: 9 })
  .toFile(join(assets, 'icon.png'));
console.log(`icon.png: ${size}×${size}, solid ${hex} with the wordmark`);
