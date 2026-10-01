// Kenyan mobile numbers (docs/spec.md §3): stored as E.164 (+2547XXXXXXXX / +2541XXXXXXXX).
// Input accepts 07…, 01…, 7…, 1…, 254… and +254…, with spaces, dashes, dots or brackets.

const SEPARATORS = /[\s\-.()]/g;
const PATTERNS = [/^\+254([17]\d{8})$/, /^254([17]\d{8})$/, /^0([17]\d{8})$/, /^([17]\d{8})$/];

/** Returns the E.164 form, or null when the input isn't a Kenyan mobile number. */
export function normalizeKePhone(input: string): string | null {
  const compact = input.trim().replace(SEPARATORS, '');
  for (const pattern of PATTERNS) {
    const match = pattern.exec(compact);
    if (match) return `+254${match[1]}`;
  }
  return null;
}

/** "+254712345678" → "0712 345 678" for display. Returns the input unchanged if it isn't E.164. */
export function formatKePhone(e164: string): string {
  const match = /^\+254(\d{3})(\d{3})(\d{3})$/.exec(e164);
  return match ? `0${match[1]} ${match[2]} ${match[3]}` : e164;
}
