import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toThemeCss } from './css';
import { colors } from './tokens';

describe('theme.css', () => {
  it('is in sync with tokens.ts (run `pnpm --filter @oda/ui-tokens generate`)', () => {
    const file = readFileSync(fileURLToPath(new URL('./theme.css', import.meta.url)), 'utf8');
    expect(file.replace(/\r\n/g, '\n')).toBe(toThemeCss());
  });

  it('keeps the brand colours from docs/design-changes.md', () => {
    expect(colors.primary).toBe('#D94A27');
    expect(colors.navy).toBe('#1C1A2E');
    expect(colors.green).toBe('#1F7A55');
  });

  it('only uses 6-digit hex colours', () => {
    for (const value of Object.values(colors)) expect(value).toMatch(/^#[0-9A-F]{6}$/);
  });
});
