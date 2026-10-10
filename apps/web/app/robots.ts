// Shop and product pages may be crawled; the API, carts, checkout, searches and order pages
// may not (M4, M5). Crawling isn't indexing: until the public launch production answers shop
// and product pages with `X-Robots-Tag: noindex` (proxy.ts, decision #96), which crawlers can
// only see because they aren't blocked here.
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/*/cart', '/*/checkout', '/*/search', '/o/', '/reset-password', '/dev/'],
    },
  };
}
