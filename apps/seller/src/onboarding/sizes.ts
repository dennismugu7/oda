// Size chips on step 4: presets are suggestions; the seller adds their own and removes any
// (owner, Step 52). Limits match the server: 20 sizes, 20 characters each.
import { SIZE_MAX_LENGTH, SIZES_MAX } from '@oda/shared';

export function toggleSize(selected: readonly string[], size: string): string[] {
  return selected.includes(size) ? selected.filter((s) => s !== size) : [...selected, size];
}

/** Adds a custom size; returns an error message instead when it can't. */
export function addCustomSize(
  selected: readonly string[],
  raw: string,
): { sizes: string[]; error: string | null } {
  const size = raw.trim().replace(/\s+/g, ' ');
  if (!size) return { sizes: [...selected], error: 'Type a size, e.g. One size.' };
  if (size.length > SIZE_MAX_LENGTH) {
    return { sizes: [...selected], error: `A size can be at most ${SIZE_MAX_LENGTH} characters.` };
  }
  if (selected.some((s) => s.toLowerCase() === size.toLowerCase()))
    return { sizes: [...selected], error: null };
  if (selected.length >= SIZES_MAX)
    return { sizes: [...selected], error: `Add at most ${SIZES_MAX} sizes.` };
  return { sizes: [...selected, size], error: null };
}

/** The chips to show: presets first, then the seller's own in the order added. */
export function sizeChips(presets: readonly string[], selected: readonly string[]): string[] {
  return [...presets, ...selected.filter((s) => !presets.includes(s))];
}
