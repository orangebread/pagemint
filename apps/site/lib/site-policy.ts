function readPublicSetting(value: string | undefined): string | undefined {
  const nextValue = value?.trim();
  return nextValue ? nextValue : undefined;
}

export function getProjectDisplayName(value = process.env.NEXT_PUBLIC_PAGEMINT_PROJECT_NAME): string {
  return readPublicSetting(value) ?? 'PageMint';
}

export const githubRepositoryUrl = 'https://github.com/orangebread/pagemint';
export const githubIssuesUrl = `${githubRepositoryUrl}/issues`;
export const mitLicenseUrl = `${githubRepositoryUrl}/blob/main/LICENSE`;
export const chromeWebStoreListingUrl = 'https://chromewebstore.google.com/detail/pagemint/clkeafinfphgcfhenakanegeibknecbm';

export function getChromeWebStoreUrl(value = process.env.NEXT_PUBLIC_PAGEMINT_EXTENSION_URL): string {
  return readPublicSetting(value) ?? chromeWebStoreListingUrl;
}

export function getLaunchCtaConfig(chromeWebStoreUrl: string | null = getChromeWebStoreUrl()) {
  return {
    href: chromeWebStoreUrl ?? chromeWebStoreListingUrl,
    label: 'Install from Chrome Web Store',
    external: true
  } as const;
}

export const limitedUseNotice =
  'PageMint uses browser data only to provide the user-requested local capture workflow and follows the Chrome Web Store Limited Use requirements.';

export const siteMetadataTagline =
  'Free MIT browser capture · no cloud, no account';

export const siteMetadataDescription =
  'Free and open-source local browser capture for saving trustworthy PDFs. Page content, settings, and optional history stay on your device.';

export const siteBaseUrl = 'https://pagemint.space';

export const siteCanonicalPaths = [
  '/',
  '/trust',
  '/support',
  '/privacy',
  '/terms'
] as const;

export type SiteCanonicalPath = typeof siteCanonicalPaths[number];

export function createSiteUrl(pathname: string): string {
  const normalizedPathname = pathname === '/'
    ? '/'
    : `/${pathname.replace(/^\/+|\/+$/gu, '')}`;

  return new URL(normalizedPathname, siteBaseUrl).toString();
}

export const localOnlyBoundarySummary =
  'PageMint is local browser software: no hosted rendering, no telemetry, no account system, and no private support desk.';

export const localOnlyDataSummary =
  'Page content, rendered PDFs, extension settings, and optional local history stay in the browser profile where PageMint is installed.';

export const publicSupportSummary =
  'Support and bug reports happen through the public GitHub issue tracker; do not include private page content, secrets, or personal records in issues.';

export const primarySiteLinks = [
  { href: '/', label: 'Product' },
  { href: '/trust', label: 'Trust' },
  { href: '/support', label: 'Support' }
] as const;

export const footerPolicyLinks = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/support', label: 'Support' }
] as const;

export const fossInfoLinks = [
  {
    href: githubRepositoryUrl,
    title: 'Source code',
    body: 'Inspect, fork, and contribute to the PageMint source repository.',
    cta: 'Open repository'
  },
  {
    href: mitLicenseUrl,
    title: 'MIT license',
    body: 'Use, modify, and redistribute PageMint under the MIT license.',
    cta: 'Read license'
  },
  {
    href: githubIssuesUrl,
    title: 'Issues and support',
    body: 'Report bugs or request changes in public, with no private page content attached.',
    cta: 'Open issues'
  }
] as const;
