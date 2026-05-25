import Link from 'next/link';
import { PermissionCard } from '../../components/permission-card';
import { createPublicPageMetadata } from '../../lib/site-metadata';

import {
  baselinePermissions,
  highFidelityFacts,
  highFidelityInstallPermission,
  localFirstFacts,
  trustGuardrails,
  trustHeroLead
} from '../../lib/trust-copy';

export const metadata = createPublicPageMetadata({
  pathname: '/trust',
  title: 'PageMint Trust & Permissions',
  description: trustHeroLead
});

export default function TrustPage(): React.ReactNode {
  return (
    <main>
      <div className="hero">
        <section className="panel heroPanel">
          <p className="eyebrow">Trust &amp; permissions</p>
          <h1>
            What we ask for,<br />
            <em>and why.</em>
          </h1>
          <p className="lead">
            {trustHeroLead}
          </p>
          <p>
            <Link className="textLink" href="/">← Back to the product</Link>
          </p>
          <p>
            <Link className="textLink" href="/privacy">Read the privacy policy</Link>
          </p>
        </section>

        <section className="panel sectionPanel">
          <div className="sectionHeading">
            <p className="eyebrow eyebrow--mint">Default path permission baseline</p>
            <h2>Three permissions power the shipped local-first path.</h2>
          </div>
          <div className="grid cardGrid">
            {baselinePermissions.map((item) => (
              <PermissionCard key={item.permission} {...item} />
            ))}
          </div>
        </section>

        <section className="panel sectionPanel">
          <div className="sectionHeading">
            <p className="eyebrow">High-fidelity rendering</p>
            <h2>`debugger` is declared up front, gated behind a toggle, and only attached on demand.</h2>
          </div>
          <PermissionCard {...highFidelityInstallPermission} />
          <div className="stackList">
            {highFidelityFacts.map((fact) => (
              <div className="callout mutedCallout" key={fact}>
                <span aria-hidden="true">·</span>
                <p>{fact}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid splitGrid">
          <article className="panel sectionPanel">
            <div className="sectionHeading">
              <p className="eyebrow">What stays local</p>
              <h2>Local-first is still the headline for both paths.</h2>
            </div>
            <div className="stackList">
              {localFirstFacts.map((fact) => (
                <div className="callout" key={fact}>
                  <span aria-hidden="true">✓</span>
                  <p>{fact}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="panel sectionPanel">
            <div className="sectionHeading">
              <p className="eyebrow">Trust guardrails</p>
              <h2>The debugger permission never blurs the default story.</h2>
            </div>
            <div className="stackList">
              {trustGuardrails.map((item) => (
                <div className="callout mutedCallout" key={item}>
                  <span aria-hidden="true">·</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </article>
        </div>

        <section className="panel sectionPanel">
          <div className="sectionHeading">
            <p className="eyebrow">Policy links</p>
            <h2>Trust copy is not a substitute for privacy or support terms.</h2>
          </div>
          <div className="stackList">
            <div className="callout">
              <span aria-hidden="true">✓</span>
            <p><Link className="textLink" href="/privacy">Privacy policy</Link> covers local processing, browser storage, public support boundaries, and what PageMint does not receive.</p>
            </div>
            <div className="callout">
              <span aria-hidden="true">✓</span>
              <p><Link className="textLink" href="/terms">Terms</Link> cover the MIT license and open-source support boundary.</p>
            </div>
            <div className="callout">
              <span aria-hidden="true">✓</span>
              <p><Link className="textLink" href="/support">Support</Link> covers GitHub issue reporting and the no-private-content support boundary.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
