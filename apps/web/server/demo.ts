import 'server-only';

// Demo shops (decision #61 g): a "Demo shop: don't send money" banner on their pages, switched
// on by config (DEMO_SHOP_SLUGS, comma-separated), with no database column.

export function demoShopSlugs(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    (env.DEMO_SHOP_SLUGS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isDemoShop(slug: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return demoShopSlugs(env).has(slug.toLowerCase());
}
