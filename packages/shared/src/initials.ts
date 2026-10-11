// Avatar initials, the same on the app and the web (owner, QA round 1, decision #101):
// one word → its first letter ("Furaha" → "F"); two or more → the first letters of the
// first two words ("Furaha Styles" → "FS", "Mama Njeri Fabrics" → "MN"). Letters are taken
// whole (an emoji or accented letter is never split) and upper-cased.

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => Array.from(w)[0] ?? '')
    .join('')
    .toUpperCase();
}
