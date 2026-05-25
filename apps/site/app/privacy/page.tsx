import Link from 'next/link';

import { createPublicPageMetadata } from '../../lib/site-metadata';
import {
  githubIssuesUrl,
  limitedUseNotice,
  localOnlyBoundarySummary,
  localOnlyDataSummary,
  publicSupportSummary,
  siteMetadataDescription
} from '../../lib/site-policy';

export const metadata = createPublicPageMetadata({
  pathname: '/privacy',
  title: 'PageMint Privacy Policy',
  description: siteMetadataDescription
});

export default function PrivacyPage(): React.ReactNode {
  return (
    <main>
      <div className="hero">
        <section className="panel heroPanel">
          <p className="eyebrow">Privacy policy</p>
          <h1>
            Local output.<br />
            <em>No PageMint backend.</em>
          </h1>
          <p className="lead">
            PageMint is designed so page content, rendered PDFs, settings, and optional local history stay in your browser profile. The shipped product does not send this data to a PageMint service.
          </p>
          <p>
            <Link className="textLink" href="/">← Back to the product</Link>
          </p>
        </section>

        <section className="panel sectionPanel">
          <div className="sectionHeading">
            <p className="eyebrow eyebrow--mint">What stays local</p>
            <h2>The capture workflow runs on your device.</h2>
          </div>
          <div className="stackList">
            <div className="callout">
              <span aria-hidden="true">✓</span>
              <p>{localOnlyDataSummary}</p>
            </div>
            <div className="callout">
              <span aria-hidden="true">✓</span>
              <p>Standard export uses Chrome's print flow from the active tab.</p>
            </div>
            <div className="callout">
              <span aria-hidden="true">✓</span>
              <p>High Fidelity renders locally through Chrome DevTools Protocol and writes the PDF through local browser save or download APIs.</p>
            </div>
          </div>
        </section>

        <section className="panel sectionPanel">
          <div className="sectionHeading">
            <p className="eyebrow">What PageMint receives</p>
            <h2>No account, telemetry, or private support service is active.</h2>
          </div>
          <div className="stackList">
            <div className="callout">
              <span aria-hidden="true">✓</span>
              <p>{localOnlyBoundarySummary}</p>
            </div>
            <div className="callout">
              <span aria-hidden="true">✓</span>
              <p>No page URLs, page HTML, screenshots, article text, exported PDFs, extension settings, or local history are uploaded to PageMint.</p>
            </div>
            <div className="callout">
              <span aria-hidden="true">✓</span>
              <p>{limitedUseNotice}</p>
            </div>
          </div>
        </section>

        <section className="panel sectionPanel">
          <div className="sectionHeading">
            <p className="eyebrow">Public support</p>
            <h2>GitHub issues are public.</h2>
          </div>
          <div className="stackList">
            <div className="callout mutedCallout">
              <span aria-hidden="true">•</span>
              <p>{publicSupportSummary}</p>
            </div>
            <div className="callout mutedCallout">
              <span aria-hidden="true">•</span>
              <p>Anything you submit to GitHub is governed by GitHub's own terms and privacy policies. Open issues only with information you are comfortable making public.</p>
            </div>
          </div>
          <p>
            <a className="textLink" href={githubIssuesUrl} rel="noreferrer">Open GitHub issues</a>
          </p>
        </section>
      </div>
    </main>
  );
}
