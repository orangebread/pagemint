import './globals.css';
import type { Metadata } from 'next';
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import Link from 'next/link';
import Script from 'next/script';
import { SiteHeader } from '../components/site-header';
import {
  footerPolicyLinks,
  siteBaseUrl,
  siteMetadataDescription,
  siteMetadataTagline
} from '../lib/site-policy';

const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--pm-serif',
  style: ['normal', 'italic']
});

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--pm-sans',
  weight: ['400', '500', '600']
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--pm-mono',
  weight: ['400', '500']
});

export const metadata: Metadata = {
  metadataBase: new URL(siteBaseUrl),
  title: 'PageMint — A small press for the web',
  description: siteMetadataDescription
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>): React.ReactNode {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <Script id="pm-theme-bootstrap" src="/theme-bootstrap.js" strategy="beforeInteractive" />
      </head>
      <body>
        <div className="siteShell">
          <SiteHeader />
          {children}
          <footer className="siteFoot">
            <div className="siteFootInner">
              <div className="siteFootMeta">
                <span className="siteFootMark">PageMint <em>Press</em></span>
                <span className="siteFootOrnament" aria-hidden="true" />
                <span className="siteFootNote">{siteMetadataTagline}</span>
                <span className="siteFootOrnament" aria-hidden="true" />
                <span className="siteFootStamp">v1 · MMXXVI</span>
              </div>
              <nav aria-label="Footer">
                <ul className="siteFootLinks">
                  {footerPolicyLinks.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href}>{link.label}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
