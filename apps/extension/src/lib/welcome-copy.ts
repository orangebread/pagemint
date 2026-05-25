export const welcomeSiteOrigin = 'https://pagemint.space';

export type WelcomeSiteLink = {
  href: string;
  label: string;
  target: '_blank';
  rel: 'noopener noreferrer';
};

function siteLink(path: string, label: string): WelcomeSiteLink {
  return {
    href: `${welcomeSiteOrigin}${path}`,
    label,
    target: '_blank',
    rel: 'noopener noreferrer'
  };
}

function externalLink(href: string, label: string): WelcomeSiteLink {
  return {
    href,
    label,
    target: '_blank',
    rel: 'noopener noreferrer'
  };
}

export const welcomeSiteLinks = {
  source: externalLink('https://github.com/orangebread/pagemint', 'View source on GitHub'),
  trust: siteLink('/trust', 'Trust & permissions')
} as const;

export const welcomeCopy = {
  eyebrow: 'Welcome to PageMint',
  titleLineOne: 'Pin once.',
  titleLineTwo: 'Capture forever.',
  lead: 'Two steps and PageMint is one click away on every page. Local-first, exact export, no telemetry.',
  trustChips: ['Local-first', 'No telemetry', 'Exact export'] as const,
  demo: {
    tag: 'pagemint · live capture',
    caption: 'A page captured and rendered to PDF — locally, in one click.',
    // Bundled at build time from apps/demo-video. Resolves to
    // chrome-extension://<id>/demo/pagemint-demo.mp4 inside the welcome page.
    src: '/demo/pagemint-demo.mp4',
    alt: 'PageMint browser extension capturing a web page and rendering it to a local PDF.'
  },
  step1: {
    title: 'Pin PageMint to your toolbar',
    body: "Click the puzzle icon in Chrome's toolbar, then click the pin next to PageMint. The icon stays put so you can capture from any tab."
  },
  step2: {
    title: 'Capture from anywhere',
    bodyBefore: 'Click the PageMint icon, or press ',
    bodyAfter: ' on any page to open the popup and export to PDF.'
  },
  footer: {
    left: 'Local-first. No sync. No telemetry.'
  }
} as const;
