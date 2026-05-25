import Image from 'next/image';
import Link from 'next/link';

import { primarySiteLinks, siteMetadataTagline } from '../lib/site-policy';
import { GithubRepoLink } from './github-repo-link';
import { ThemeToggle } from './theme-toggle';

export async function SiteHeader() {
  return (
    <header className="siteHeader">
      <div className="siteHeaderInner">
        <Link className="brand" href="/">
          <Image
            src="/brand/paper-1024.svg"
            alt=""
            className="brandMark"
            width={36}
            height={36}
            priority
          />
          <span className="brandText">
            PageMint
            <span className="brandDot" aria-hidden="true" />
          </span>
          <span className="brandTag">{siteMetadataTagline}</span>
        </Link>
        <div className="siteHeaderRight">
          <nav aria-label="Primary">
            <ul className="navList">
              {primarySiteLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <GithubRepoLink />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
