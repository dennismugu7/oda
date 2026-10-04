import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INSTAGRAM_GLYPH_BLACK_SVG, WHATSAPP_GLYPH_GREEN_SVG } from './brandSvgs';

const asset = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../assets/brands/${name}`, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');

describe('brand marks are used exactly as provided (decision #55)', () => {
  it('the embedded SVGs are identical to the official files', () => {
    expect(WHATSAPP_GLYPH_GREEN_SVG).toBe(asset('whatsapp-glyph-green.svg'));
    expect(INSTAGRAM_GLYPH_BLACK_SVG).toBe(asset('instagram-glyph-black.svg'));
  });

  it('keep their own colours (WhatsApp green, Instagram black)', () => {
    expect(WHATSAPP_GLYPH_GREEN_SVG).toContain('fill: #25d366');
    expect(INSTAGRAM_GLYPH_BLACK_SVG).not.toMatch(/fill=/);
  });
});
