// Where "oda" points on production (owner, 2026-10-10; decision #99): the root of
// oda.mugu-labs.com redirects permanently to the product page on mugu-labs.com, and the error
// pages' "Go to oda" links go straight there. Staging, previews and local runs keep the landing
// page at "/" (Playwright and the staging regression test it).

/** oda's product page on the Mugu Labs site. */
export const PRODUCT_PAGE_URL = 'https://mugu-labs.com/products/oda/';

/** "/" everywhere except production, where it is the product page. */
export function homeHrefFor(odaEnv: string | undefined): string {
  return odaEnv?.trim() === 'production' ? PRODUCT_PAGE_URL : '/';
}

/** next.config redirects: production's "/" only, permanent (308), nothing else. */
export function homeRedirects(odaEnv: string | undefined) {
  return homeHrefFor(odaEnv) === '/'
    ? []
    : [{ source: '/', destination: PRODUCT_PAGE_URL, permanent: true }];
}

// Written out as process.env.NEXT_PUBLIC_ODA_ENV so Next inlines it into client components.
export const HOME_HREF = homeHrefFor(process.env.NEXT_PUBLIC_ODA_ENV);
