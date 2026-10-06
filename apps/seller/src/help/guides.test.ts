import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GUIDES } from './guides';
import { boldSegments, fillVars, searchGuides } from './search';

// The in-app guides (owner-approved, Step 85) must stay exactly the text in
// docs/help-guides.md: change both together.

const DOC = readFileSync(path.resolve(__dirname, '../../../../docs/help-guides.md'), 'utf8');

/** The guides as written in the doc: "## n. Title", Summary, Keywords, "**Heading.** text". */
function parseDoc(doc: string) {
  return doc
    .split(/^## \d+\. /m)
    .slice(1)
    .map((block) => {
      const lines = block
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const title = lines[0]!;
      const summary = lines.find((l) => l.startsWith('**Summary:**'))!.replace('**Summary:** ', '');
      const keywords = lines
        .find((l) => l.startsWith('**Keywords:**'))!
        .replace('**Keywords:** ', '')
        .split(', ');
      const sections = lines
        .filter(
          (l) =>
            /^\*\*[^*]+\.\*\* /.test(l) &&
            !l.startsWith('**Summary') &&
            !l.startsWith('**Keywords'),
        )
        .map((l) => {
          const m = /^\*\*([^*]+)\.\*\* (.*)$/.exec(l)!;
          return { heading: m[1]!, body: m[2]! };
        });
      return { title, summary, keywords, sections };
    });
}

describe('help guides', () => {
  it('match docs/help-guides.md word for word', () => {
    expect(parseDoc(DOC)).toEqual(
      GUIDES.map(({ title, summary, keywords, sections }) => ({
        title,
        summary,
        keywords,
        sections,
      })),
    );
  });

  it('carry the owner’s Step 85 fixes', () => {
    const all = GUIDES.flatMap((g) => g.sections.map((s) => s.body)).join('\n');
    // Every "the buyer gets an email" says it needs an email at checkout.
    for (const m of all.matchAll(/buyer gets an email[^.]*\./g)) {
      expect(m[0]).toContain('if they gave an email at checkout');
    }
    expect(all).toContain('**Payment isn’t in my M-Pesa**');
    expect(all).toContain('The review stays visible while the oda team checks it');
    expect(all).toContain('{deleteAccountUrl}');
    expect(all).not.toMatch(/your oda link.s/);
    expect(all).not.toMatch(/QR/);
  });

  it('search finds "refund" in Getting paid first, any case, all words required', () => {
    expect(searchGuides(GUIDES, 'refund')[0]!.id).toBe('getting-paid');
    expect(searchGuides(GUIDES, 'REFUND')[0]!.id).toBe('getting-paid');
    expect(searchGuides(GUIDES, 'pickup').map((g) => g.id)).toContain('delivery');
    expect(searchGuides(GUIDES, 'delete account').map((g) => g.id)).toEqual(['account']);
    expect(searchGuides(GUIDES, 'zzz')).toEqual([]);
    expect(searchGuides(GUIDES, '  ')).toHaveLength(GUIDES.length);
  });

  it('fills config values and splits bold names', () => {
    expect(
      fillVars('Go to {deleteAccountUrl} or email {supportEmail}.', {
        deleteAccountUrl: 'oda.test/delete-account',
        supportEmail: 'help@oda.test',
      }),
    ).toBe('Go to oda.test/delete-account or email help@oda.test.');
    expect(boldSegments('Tap **Accept order** now (see *Getting paid*).')).toEqual([
      { text: 'Tap ', bold: false },
      { text: 'Accept order', bold: true },
      { text: ' now (see Getting paid).', bold: false },
    ]);
  });
});
