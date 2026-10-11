import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The web shop shows WhatsApp's official glyph unmodified: the served file must stay a
// byte-for-byte copy of the one in the seller app's brand folder (public/brands/README.md).

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)));

describe('brand assets', () => {
  it('the WhatsApp glyph is the official file, unchanged', () => {
    const web = read('../public/brands/whatsapp-glyph-green.svg');
    const seller = read('../../seller/assets/brands/whatsapp-glyph-green.svg');
    expect(web.equals(seller)).toBe(true);
  });
});
