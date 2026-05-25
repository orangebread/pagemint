import React from 'react';
import { welcomeCopy, welcomeSiteLinks } from '../../lib/welcome-copy';
import { PinFigure } from './pin-figure';

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = navigator.platform || '';
  return /Mac|iPhone|iPad/.test(platform);
}

function ShortcutKeys() {
  const mac = isMacPlatform();
  if (mac) {
    return (
      <span className="shortcut">
        <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>P</kbd>
      </span>
    );
  }
  return (
    <span className="shortcut">
      <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>P</kbd>
    </span>
  );
}

export function App() {
  return (
    <main className="welcomePage">
      <p className="eyebrow">{welcomeCopy.eyebrow}</p>
      <h1 className="title">
        <span>{welcomeCopy.titleLineOne}</span>
        <br />
        <span>{welcomeCopy.titleLineTwo}</span>
      </h1>
      <p className="lead">{welcomeCopy.lead}</p>

      <ul className="chipRow" aria-label="Trust">
        {welcomeCopy.trustChips.map((chip) => (
          <li key={chip} className="chip">{chip}</li>
        ))}
      </ul>

      <figure className="demoVideoFigure">
        <span className="demoVideoTag">{welcomeCopy.demo.tag}</span>
        <video
          className="demoVideoMedia"
          src={welcomeCopy.demo.src}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={welcomeCopy.demo.alt}
        />
        <figcaption className="demoVideoCaption">{welcomeCopy.demo.caption}</figcaption>
      </figure>

      <hr className="rule" />

      <section className="step" aria-labelledby="step-1-title">
        <span className="stepMedallion" aria-hidden="true">i</span>
        <div className="stepBody">
          <h2 id="step-1-title" className="stepTitle">{welcomeCopy.step1.title}</h2>
          <p className="stepText">{welcomeCopy.step1.body}</p>
          <div className="stepFigure">
            <PinFigure />
          </div>
        </div>
      </section>

      <section className="step" aria-labelledby="step-2-title">
        <span className="stepMedallion" aria-hidden="true">ii</span>
        <div className="stepBody">
          <h2 id="step-2-title" className="stepTitle">{welcomeCopy.step2.title}</h2>
          <p className="stepText">
            {welcomeCopy.step2.bodyBefore}
            <ShortcutKeys />
            {welcomeCopy.step2.bodyAfter}
          </p>
        </div>
      </section>

      <footer className="welcomeFooter">
        <span>{welcomeCopy.footer.left}</span>
        <span className="footerLinks">
          <a href={welcomeSiteLinks.source.href} target={welcomeSiteLinks.source.target} rel={welcomeSiteLinks.source.rel}>
            {welcomeSiteLinks.source.label}
          </a>
          {' · '}
          <a href={welcomeSiteLinks.trust.href} target={welcomeSiteLinks.trust.target} rel={welcomeSiteLinks.trust.rel}>
            {welcomeSiteLinks.trust.label}
          </a>
        </span>
      </footer>
    </main>
  );
}
