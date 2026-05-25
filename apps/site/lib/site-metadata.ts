import type { Metadata } from 'next';

import {
  createSiteUrl,
  siteMetadataDescription
} from './site-policy';

type PublicPageMetadataInput = {
  title: string;
  pathname: string;
  description?: string;
};

export function createPublicPageMetadata(input: PublicPageMetadataInput): Metadata {
  const description = input.description ?? siteMetadataDescription;
  const url = createSiteUrl(input.pathname);

  return {
    title: input.title,
    description,
    alternates: {
      canonical: url
    },
    openGraph: {
      title: input.title,
      description,
      url,
      siteName: 'PageMint',
      type: 'website'
    },
    twitter: {
      card: 'summary',
      title: input.title,
      description
    }
  };
}
