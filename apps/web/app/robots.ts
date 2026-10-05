// Shop and product pages may be indexed; the API, carts, checkout, searches and order pages
// may not (M4, M5).
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
