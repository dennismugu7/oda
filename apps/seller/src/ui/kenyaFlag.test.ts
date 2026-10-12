import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { KENYA_FLAG_SVG } from './flagSvgs';

// Kenya's flag is flag-icons' file, unmodified (assets/flags/README.md, decision #109 b).

const file = readFileSync(fileURLToPath(new URL('../../assets/flags/ke.svg', import.meta.url)));

describe('Kenya flag', () => {
  it('is flag-icons 7.2.3 flags/4x3/ke.svg, byte for byte', () => {
    expect(createHash('sha256').update(file).digest('hex')).toBe(
      '699163d87382eb969d8a26d4ce1a99a00264e8b7b95276abf585476506f46e82',
    );
  });

  it('the app draws exactly that file', () => {
    expect(KENYA_FLAG_SVG).toBe(file.toString('utf8'));
  });

  it('has the five stripes and the shield (not oda’s old three-stripe stand-in)', () => {
    for (const colour of ['#000001', '#fff', '#b00', '#060']) {
      expect(KENYA_FLAG_SVG).toContain(`fill="${colour}"`);
    }
    expect(KENYA_FLAG_SVG).toContain('<ellipse');
  });
});
