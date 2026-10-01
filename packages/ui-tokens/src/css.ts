import { colors, radii, spacing, typography } from './tokens';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * Tailwind 4 theme generated from tokens.ts. Written to src/theme.css by
 * `pnpm --filter @oda/ui-tokens generate`; a test fails if the file is stale.
 */
export function toThemeCss(): string {
  const lines: string[] = [
    '/* Generated from src/tokens.ts by `pnpm --filter @oda/ui-tokens generate`. Do not edit. */',
    '@theme {',
    '  --font-sans: var(--font-poppins), ui-sans-serif, system-ui, sans-serif;',
  ];
  for (const [name, value] of Object.entries(colors))
    lines.push(`  --color-${kebab(name)}: ${value};`);
  for (const [name, value] of Object.entries(radii))
    lines.push(`  --radius-${kebab(name)}: ${value === 999 ? '9999px' : `${value}px`};`);
  // Spacing is not emitted by name: `--spacing-md` would also redefine `max-w-md`, `w-md`, etc.
  // The web uses Tailwind's numeric scale, which is the same 4px grid (p-5 = spacing.lg = 20px).
  lines.push(`  --spacing: ${spacing.xs}px;`);
  for (const [name, t] of Object.entries(typography)) {
    const key = kebab(name);
    lines.push(`  --text-${key}: ${t.size}px;`);
    lines.push(`  --text-${key}--line-height: ${t.lineHeight}px;`);
    lines.push(`  --text-${key}--letter-spacing: ${t.letterSpacing}px;`);
    lines.push(`  --text-${key}--font-weight: ${weightOf(t.weight)};`);
  }
  lines.push('}', '');
  return lines.join('\n');
}

function weightOf(w: 'regular' | 'medium' | 'semibold' | 'bold'): number {
  return { regular: 400, medium: 500, semibold: 600, bold: 700 }[w];
}
