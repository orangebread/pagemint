import Link from 'next/link';

import { createPublicPageMetadata } from '../../lib/site-metadata';
import {
  githubRepositoryUrl,
  mitLicenseUrl,
  publicSupportSummary
} from '../../lib/site-policy';

export const metadata = createPublicPageMetadata({
  pathname: '/terms',
  title: 'PageMint Terms',
  description: 'PageMint is MIT-licensed open-source software.'
});

export default function TermsPage(): React.ReactNode {
  return (
    <main>
      <div className="hero">
        <section className="panel heroPanel">
          <p className="eyebrow">Terms</p>
          <h1>
            MIT-licensed<br />
            <em>open source.</em>
          </h1>
          <p className="lead">
            PageMint is distributed as MIT-licensed software. Use, modify, and redistribute it under the terms of the license.
          </p>
          <p>
            <Link className="textLink" href="/">← Back to the product</Link>
          </p>
        </section>

        <section className="panel sectionPanel">
          <div className="sectionHeading">
            <p className="eyebrow eyebrow--mint">License</p>
            <h2>Use PageMint under the MIT license.</h2>
          </div>
          <div className="stackList">
            <div className="callout">
              <span aria-hidden="true">✓</span>
              <p>The MIT license allows use, copying, modification, distribution, sublicensing, and sale of copies, subject to preserving the license notice.</p>
            </div>
            <div className="callout">
              <span aria-hidden="true">✓</span>
              <p>The software is provided without warranty, as described in the license text.</p>
            </div>
          </div>
          <p>
            <a className="textLink" href={mitLicenseUrl} rel="noreferrer">Read the license</a>
          </p>
        </section>

        <section className="panel sectionPanel">
          <div className="sectionHeading">
            <p className="eyebrow">Project support</p>
            <h2>Support is open-source project support, not a hosted service desk.</h2>
          </div>
          <div className="stackList">
            <div className="callout mutedCallout">
              <span aria-hidden="true">•</span>
              <p>{publicSupportSummary}</p>
            </div>
            <div className="callout mutedCallout">
              <span aria-hidden="true">•</span>
              <p>Source changes, bug reports, and feature requests should refer to the public repository.</p>
            </div>
          </div>
          <p>
            <a className="textLink" href={githubRepositoryUrl} rel="noreferrer">Open repository</a>
          </p>
        </section>
      </div>
    </main>
  );
}
