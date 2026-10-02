// Extracts the M-Pesa transaction code from what the buyer pastes: the bare code or the
// whole confirmation SMS. A code is 10 characters A–Z/0–9 starting with a letter. No digit
// is required: codes are random, so some are all letters. A false accept is harmless (the
// seller confirms by hand); a false reject would block a paying buyer (decision #33).

const CODE = '[A-Z][A-Z0-9]{9}';
const BEFORE_CONFIRMED = new RegExp(`\\b(${CODE})\\b[\\s.,:-]*CONFIRMED\\b`);
const ANY_CODE = new RegExp(`\\b(${CODE})\\b`);

export function extractMpesaCode(text: string): string | null {
  const upper = text.toUpperCase();
  return BEFORE_CONFIRMED.exec(upper)?.[1] ?? ANY_CODE.exec(upper)?.[1] ?? null;
}
