import type { MetadataRoute } from 'next';

import { createSiteUrl } from '../lib/site-policy';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/']
    },
    sitemap: createSiteUrl('/sitemap.xml')
  };
}
