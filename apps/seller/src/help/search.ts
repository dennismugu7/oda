// Help (20b-help): searching the bundled guides, filling in config values, and splitting
// **bold** button names out of a paragraph. Pure, unit-tested.
import type { Guide } from './guides';

export interface GuideVars {
  /** e.g. "oda-eta.vercel.app/delete-account" (from EXPO_PUBLIC_SHOP_BASE_URL). */
  deleteAccountUrl: string;
  /** From GET /api/support (decision #77), support@mugu-labs.com when offline. */
  supportEmail: string;
}

export function fillVars(text: string, vars: GuideVars): string {
  return text
    .replaceAll('{deleteAccountUrl}', vars.deleteAccountUrl)
    .replaceAll('{supportEmail}', vars.supportEmail);
}

const plain = (s: string) => s.replaceAll('**', '').replace(/[*’']/g, '').toLowerCase();

/**
 * Guides matching every word typed (title, summary, keywords and text, any case), best first:
 * a title or keyword hit ranks above one only in the text. Empty query: all guides.
 */
export function searchGuides(guides: readonly Guide[], query: string): Guide[] {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...guides];
  const scored = guides
    .map((g) => {
      const head = plain(`${g.title} ${g.summary} ${g.keywords.join(' ')}`);
      const body = plain(g.sections.map((s) => `${s.heading} ${s.body}`).join(' '));
      let score = 0;
      for (const w of words) {
        if (head.includes(w)) score += 3;
        else if (body.includes(w)) score += 1;
        else return null;
      }
      return { g, score };
    })
    .filter((x): x is { g: Guide; score: number } => x !== null);
  return scored.sort((a, b) => b.score - a.score).map((x) => x.g);
}

/** "Tap **Accept order** now" → [text, bold, text] segments for <Text>. */
export function boldSegments(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('**') && part.endsWith('**')
        ? { text: part.slice(2, -2), bold: true }
        : { text: part.replace(/\*([^*]+)\*/g, '$1'), bold: false },
    );
}
