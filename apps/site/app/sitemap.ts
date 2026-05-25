import type { MetadataRoute } from 'next';

import {
  createSiteUrl,
  siteCanonicalPaths
} from '../lib/site-policy';

export default function sitemap(): MetadataRoute.Sitemap {
  return siteCanonicalPaths.map((pathname) => ({
    url: createSiteUrl(pathname),
    changeFrequency: pathname === '/' ? 'weekly' : 'monthly',
    priority: pathname === '/' ? 1 : 0.7
  }));
}
