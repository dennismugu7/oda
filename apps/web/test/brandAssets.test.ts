import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Official brand files served by the web stay byte-for-byte copies of the ones in the seller
// app's brand folder (public/brands/README.md).

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)));

describe('brand assets', () => {
  it('the WhatsApp glyph is the official file, unchanged', () => {
    const web = read('../public/brands/whatsapp-glyph-green.svg');
    const seller = read('../../seller/assets/brands/whatsapp-glyph-green.svg');
    expect(web.equals(seller)).toBe(true);
  });

  it("Kenya's flag is flag-icons' file, unchanged, in both apps (decision #109 b)", () => {
    const web = read('../public/flags/ke.svg');
    const seller = read('../../seller/assets/flags/ke.svg');
    expect(web.equals(seller)).toBe(true);
    expect(createHash('sha256').update(web).digest('hex')).toBe(
      '699163d87382eb969d8a26d4ce1a99a00264e8b7b95276abf585476506f46e82',
    );
  });

  it("TikTok's icon is the file from TikTok's logo pack, unchanged (decision #108)", () => {
    const web = read('../public/brands/tiktok-icon-black-circle.png');
    const seller = read('../../seller/assets/brands/tiktok-icon-black-circle.png');
    expect(web.equals(seller)).toBe(true);
    expect(createHash('sha256').update(web).digest('hex')).toBe(
      'a21b43e31bb9def6d01c8c433a577353ae3efc8003a6257e8f3db3fd2dc94e61',
    );
  });
});
