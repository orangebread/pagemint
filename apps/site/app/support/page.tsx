import Link from 'next/link';

import { createPublicPageMetadata } from '../../lib/site-metadata';
import {
  githubIssuesUrl,
  githubRepositoryUrl,
  publicSupportSummary
} from '../../lib/site-policy';

export const metadata = createPublicPageMetadata({
  pathname: '/support',
  title: 'PageMint Support',
  description: publicSupportSummary
});

export default function SupportPage(): React.ReactNode {
  return (
    <main>
      <div className="hero">
        <section className="panel heroPanel">
          <p className="eyebrow">Support</p>
          <h1>Use GitHub issues.</h1>
          <p className="lead">
            PageMint support happens in the public issue tracker for bugs, compatibility reports, and feature requests.
          </p>
          <div className="heroCtas">
            <a className="btn btn--primary" href={githubIssuesUrl} rel="noreferrer">
              Open issues
              <span className="btn-arrow" aria-hidden="true">→</span>
            </a>
            <a className="btn btn--ghost" href={githubRepositoryUrl} rel="noreferrer">
              View source
              <span className="btn-arrow" aria-hidden="true">→</span>
            </a>
          </div>
          <p>
            <Link className="textLink" href="/">← Back to the product</Link>
          </p>
        </section>

        <section className="panel sectionPanel">
          <div className="sectionHeading">
            <p className="eyebrow eyebrow--mint">Before opening an issue</p>
            <h2>Keep private content private.</h2>
          </div>
          <ul className="featureSub">
            <li><strong>Do not attach page content.</strong> Keep private page HTML, screenshots, PDFs, secrets, and account data out of public issues.</li>
            <li><strong>Include environment detail.</strong> Browser, extension version, operating system, and a public URL are usually enough.</li>
            <li><strong>Check existing issues.</strong> Add confirmation to an existing issue when the behavior is already reported.</li>
          </ul>
          <p className="mutedFootnote">{publicSupportSummary}</p>
        </section>
      </div>
    </main>
  );
}
