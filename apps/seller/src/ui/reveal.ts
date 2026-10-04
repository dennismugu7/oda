// Where to scroll so a focused field (with its error and rules) is fully visible above the
// keyboard (Step 47, fix 1). Pure, so it is unit-tested.

export interface RevealInput {
  /** The field block's top and height inside the scroll content. */
  fieldTop: number;
  fieldHeight: number;
  /** Visible height of the scroll area (shrinks while the keyboard is open). */
  viewportHeight: number;
  /** Current scroll offset. */
  scrollY: number;
  /** Breathing room above and below the field. */
  margin?: number;
}

/** The scroll offset to move to, or null when the field is already fully visible. */
export function revealOffset({
  fieldTop,
  fieldHeight,
  viewportHeight,
  scrollY,
  margin = 16,
}: RevealInput): number | null {
  if (viewportHeight <= 0) return null;
  const top = fieldTop - margin;
  const bottom = fieldTop + fieldHeight + margin;
  // Taller than the view: show its top (the label and the input).
  if (bottom - top > viewportHeight) return top === scrollY ? null : Math.max(0, top);
  if (top < scrollY) return Math.max(0, top);
  if (bottom > scrollY + viewportHeight) return Math.max(0, bottom - viewportHeight);
  return null;
}
