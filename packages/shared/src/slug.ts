// Shop link slugs (docs/spec.md §4): lowercase a-z0-9-, 3–30 characters, unique, not
// reserved. Also no leading, trailing or double hyphens (decision #33).

export const SLUG_MIN = 3;
export const SLUG_MAX = 30;

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'o',
  'r',
  'app',
  'www',
  'help',
  'terms',
  'privacy',
  'delete-account',
  'reset-password',
  'login',
  'static',
  'assets',
  'oda',
]);

export type SlugProblem = 'too_short' | 'too_long' | 'invalid_characters' | 'hyphens' | 'reserved';

export type SlugCheck = { ok: true } | { ok: false; problem: SlugProblem; message: string };

const MESSAGES: Record<SlugProblem, string> = {
  too_short: `Use at least ${SLUG_MIN} characters.`,
  too_long: `Use at most ${SLUG_MAX} characters.`,
  invalid_characters: 'Use only lowercase letters, numbers and hyphens.',
  hyphens: "Don't start or end with a hyphen, or use two in a row.",
  reserved: 'This link is reserved. Try another one.',
};

export function validateSlug(slug: string): SlugCheck {
  const problem: SlugProblem | null =
    slug.length < SLUG_MIN
      ? 'too_short'
      : slug.length > SLUG_MAX
        ? 'too_long'
        : !/^[a-z0-9-]+$/.test(slug)
          ? 'invalid_characters'
          : /^-|-$|--/.test(slug)
            ? 'hyphens'
            : RESERVED_SLUGS.has(slug)
              ? 'reserved'
              : null;
  return problem ? { ok: false, problem, message: MESSAGES[problem] } : { ok: true };
}

/** "Amani Styles!" → "amani-styles". May still need validateSlug (length, reserved). */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '');
}

/** Up to `count` valid, untaken alternatives for a slug that's taken or invalid. */
export function suggestSlugs(
  base: string,
  isTaken: (slug: string) => boolean,
  count = 3,
): string[] {
  const root = slugify(base) || 'shop';
  const candidates = [
    `${root}-ke`,
    `${root}-shop`,
    ...Array.from({ length: 20 }, (_, i) => `${root}-${i + 2}`),
  ];
  const out: string[] = [];
  for (const raw of candidates) {
    // Trim the root so the suffix always fits in SLUG_MAX.
    const suffix = raw.slice(root.length);
    const slug = `${root.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (validateSlug(slug).ok && !isTaken(slug) && !out.includes(slug)) out.push(slug);
    if (out.length === count) break;
  }
  return out;
}
