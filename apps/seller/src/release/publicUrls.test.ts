import { isPublicBaseUrl as sharedRule } from '@oda/shared';
import { describe, expect, it } from 'vitest';
import { isPublicBaseUrl, parseEnvList, publicUrlProblems } from '../../scripts/public-urls.mjs';

describe('release URLs (owner Step 58: shared links must work for buyers)', () => {
  const samples = [
    'https://oda-eta.vercel.app',
    'https://oda.mugu-labs.com/',
    'http://localhost:3000',
    'https://localhost',
    'http://oda-eta.vercel.app',
    'https://10.0.2.2:3000',
    'https://192.168.0.5',
    'https://phone.local',
    '',
  ];

  it('uses the same rule as the server', () => {
    for (const url of samples) expect(isPublicBaseUrl(url), url).toBe(sharedRule(url));
  });

  it('refuses an update or build with a localhost URL', () => {
    const env = parseEnvList(
      '\nEnvironment: preview\nEXPO_PUBLIC_API_URL=https://oda-eta.vercel.app\nEXPO_PUBLIC_SHOP_BASE_URL=http://localhost:3000\n',
    );
    expect(publicUrlProblems(env)).toEqual([
      'EXPO_PUBLIC_SHOP_BASE_URL must be a public https:// URL, not "http://localhost:3000"',
    ]);
    expect(
      publicUrlProblems({
        EXPO_PUBLIC_API_URL: 'https://oda-eta.vercel.app',
        EXPO_PUBLIC_SHOP_BASE_URL: 'https://oda-eta.vercel.app',
      }),
    ).toEqual([]);
    expect(publicUrlProblems({})).toHaveLength(2);
  });
});
