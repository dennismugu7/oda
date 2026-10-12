import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GOOGLE_G_SVG, INSTAGRAM_GLYPH_BLACK_SVG, WHATSAPP_GLYPH_GREEN_SVG } from './brandSvgs';

const asset = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../assets/brands/${name}`, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');

describe('brand marks are used exactly as provided (decision #55)', () => {
  it('the embedded SVGs are identical to the official files', () => {
    expect(WHATSAPP_GLYPH_GREEN_SVG).toBe(asset('whatsapp-glyph-green.svg'));
    expect(INSTAGRAM_GLYPH_BLACK_SVG).toBe(asset('instagram-glyph-black.svg'));
    expect(GOOGLE_G_SVG).toBe(asset('google-g.svg'));
  });

  it("TikTok's icon is the file from TikTok's logo pack, unchanged (decision #108)", () => {
    const png = readFileSync(
      fileURLToPath(new URL('../../assets/brands/tiktok-icon-black-circle.png', import.meta.url)),
    );
    // Recorded in assets/brands/README.md: logo-pack.zip → TikTok_Icon_Black_Circle.png.
    expect(createHash('sha256').update(png).digest('hex')).toBe(
      'a21b43e31bb9def6d01c8c433a577353ae3efc8003a6257e8f3db3fd2dc94e61',
    );
  });

  it('no screen still shows the old TikTok stand-in (a music note)', () => {
    const root = fileURLToPath(new URL('../..', import.meta.url));
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
      });
    const offenders = [...files(join(root, 'app')), ...files(join(root, 'src'))].filter(
      (path) =>
        !path.endsWith('brandIcons.test.ts') &&
        /MusicNote|music-note|['"]music['"]/.test(readFileSync(path, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('keep their own colours (WhatsApp green, Instagram black)', () => {
    expect(WHATSAPP_GLYPH_GREEN_SVG).toContain('fill: #25d366');
    expect(INSTAGRAM_GLYPH_BLACK_SVG).not.toMatch(/fill=/);
    // Google's four colours, unchanged.
    for (const colour of ['#EA4335', '#4285F4', '#FBBC05', '#34A853']) {
      expect(GOOGLE_G_SVG).toContain(`fill="${colour}"`);
    }
  });
});
