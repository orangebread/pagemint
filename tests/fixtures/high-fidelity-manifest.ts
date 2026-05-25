import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type HighFidelityBrowserFixtureId =
  | 'stable-article'
  | 'spa-navigation'
  | 'spa-navigation-interrupted'
  | 'fixed-shell-article'
  | 'comment-heavy-article'
  | 'substack-overlay-collapse';

export type HighFidelityScopedArticleFixtureId =
  | 'clean-article-basic'
  | 'clean-article-legacy-id-collision'
  | 'clean-article-overlapping-supplements'
  | 'clean-article-stop-selector-penalty'
  | 'clean-article-adapter-generic-rescue';

export type HighFidelityFixtureId = HighFidelityBrowserFixtureId | HighFidelityScopedArticleFixtureId;

interface HighFidelityFixtureBase {
  id: HighFidelityFixtureId;
  label: string;
  description: string;
  relativePath: string;
}

export interface HighFidelityBrowserFixtureDefinition extends HighFidelityFixtureBase {
  id: HighFidelityBrowserFixtureId;
  kind: 'browser-boundary';
  routePath: string;
}

export interface HighFidelityScopedArticleFixtureDefinition extends HighFidelityFixtureBase {
  id: HighFidelityScopedArticleFixtureId;
  kind: 'scoped-article';
  request: {
    url: string;
    title: string;
  };
}

type HighFidelityFixtureDefinition =
  | HighFidelityBrowserFixtureDefinition
  | HighFidelityScopedArticleFixtureDefinition;

export interface LoadedHighFidelityBrowserFixture extends HighFidelityBrowserFixtureDefinition {
  absolutePath: string;
  html: string;
}

export interface LoadedHighFidelityScopedArticleFixture extends HighFidelityScopedArticleFixtureDefinition {
  absolutePath: string;
  html: string;
}

const highFidelityFixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'high-fidelity'
);

export const highFidelityBrowserFixtureManifest = [
  {
    id: 'stable-article',
    kind: 'browser-boundary',
    label: 'Stable article page',
    description: 'Representative article page used for the happy-path browser boundary export.',
    routePath: '/stable-article',
    relativePath: 'browser/stable-article.html'
  },
  {
    id: 'spa-navigation',
    kind: 'browser-boundary',
    label: 'SPA navigation drift page',
    description: 'Triggers a same-tab navigation during DOM preparation to validate runtime snapshot classification.',
    routePath: '/spa-navigation',
    relativePath: 'browser/spa-navigation.html'
  },
  {
    id: 'spa-navigation-interrupted',
    kind: 'browser-boundary',
    label: 'SPA interruption landing page',
    description: 'Represents the document observed after the SPA navigation interruption.',
    routePath: '/spa-navigation/interrupted',
    relativePath: 'browser/spa-navigation-interrupted.html'
  },
  {
    id: 'fixed-shell-article',
    kind: 'browser-boundary',
    label: 'Fixed app-shell article page',
    description: 'Keeps the reading surface inside a fixed overflow shell so scoped-root visibility survives export.',
    routePath: '/fixed-shell-article',
    relativePath: 'browser/fixed-shell-article.html'
  },
  {
    id: 'comment-heavy-article',
    kind: 'browser-boundary',
    label: 'Comment-heavy article page',
    description: 'Exercises generic root selection when a noisy comment block could make the whole main container look larger.',
    routePath: '/comment-heavy-article',
    relativePath: 'browser/comment-heavy-article.html'
  },
  {
    id: 'substack-overlay-collapse',
    kind: 'browser-boundary',
    label: 'Substack-like overlay collapse page',
    description: 'Long article page with fixed subscribe/media chrome and print CSS that can collapse whole-page output.',
    routePath: '/substack-overlay-collapse',
    relativePath: 'browser/substack-overlay-collapse.html'
  }
] as const satisfies readonly HighFidelityBrowserFixtureDefinition[];

export const highFidelityScopedArticleFixtureManifest = [
  {
    id: 'clean-article-basic',
    kind: 'scoped-article',
    label: 'Scoped exact-article happy path',
    description: 'Long-form adapter-backed article with removable chrome, inline media, and suppressed supplements for exact scoped export.',
    relativePath: 'clean-article/clean-article-basic.html',
    request: {
      url: 'https://example.substack.com/p/story',
      title: 'Aries New Moon Manifestation Guide'
    }
  },
  {
    id: 'clean-article-legacy-id-collision',
    kind: 'scoped-article',
    label: 'Legacy PageMint id collision',
    description: 'Ensures page-owned legacy ids survive cleanup while owned export nodes are removed.',
    relativePath: 'clean-article/clean-article-legacy-id-collision.html',
    request: {
      url: 'https://example.substack.com/p/story',
      title: 'Aries New Moon Manifestation Guide'
    }
  },
  {
    id: 'clean-article-overlapping-supplements',
    kind: 'scoped-article',
    label: 'Overlapping supplement selectors',
    description: 'Validates benchmark counters dedupe overlapping comment and recommendation selector matches during exact scoped export.',
    relativePath: 'clean-article/clean-article-overlapping-supplements.html',
    request: {
      url: 'https://example.substack.com/p/story',
      title: 'Aries New Moon Manifestation Guide'
    }
  },
  {
    id: 'clean-article-stop-selector-penalty',
    kind: 'scoped-article',
    label: 'Stop-selector penalty',
    description: 'Generic root selection should prefer the article over a noisy main container dominated by comments during exact scoped export.',
    relativePath: 'clean-article/clean-article-stop-selector-penalty.html',
    request: {
      url: 'https://example.com/story',
      title: 'Focused Story'
    }
  },
  {
    id: 'clean-article-adapter-generic-rescue',
    kind: 'scoped-article',
    label: 'Adapter generic rescue',
    description: 'Adapter-supported hosts should still fall through to the stronger generic root when the adapter node is weak during exact scoped export.',
    relativePath: 'clean-article/clean-article-adapter-generic-rescue.html',
    request: {
      url: 'https://example.substack.com/p/story',
      title: 'Short Story'
    }
  }
] as const satisfies readonly HighFidelityScopedArticleFixtureDefinition[];

const highFidelityFixtureManifest = [
  ...highFidelityBrowserFixtureManifest,
  ...highFidelityScopedArticleFixtureManifest
] satisfies readonly HighFidelityFixtureDefinition[];

const fixtureHtmlCache = new Map<HighFidelityFixtureId, Promise<string>>();

function getAbsoluteFixturePath(relativePath: string) {
  return path.join(highFidelityFixtureDir, relativePath);
}

function assertUniqueFixtureField(
  fixtures: readonly HighFidelityFixtureDefinition[],
  fieldName: 'id' | 'relativePath'
) {
  const seenValues = new Map<string, string>();

  for (const fixture of fixtures) {
    const fieldValue = fixture[fieldName];
    const previousFixtureId = seenValues.get(fieldValue);

    if (previousFixtureId) {
      throw new Error(
        `Duplicate high-fidelity fixture ${fieldName} "${fieldValue}" for fixtures "${previousFixtureId}" and "${fixture.id}".`
      );
    }

    seenValues.set(fieldValue, fixture.id);
  }
}

function assertUniqueBrowserRoutePaths(fixtures: readonly HighFidelityBrowserFixtureDefinition[]) {
  const seenRoutePaths = new Map<string, string>();

  for (const fixture of fixtures) {
    const previousFixtureId = seenRoutePaths.get(fixture.routePath);

    if (previousFixtureId) {
      throw new Error(
        `Duplicate high-fidelity browser route path "${fixture.routePath}" for fixtures "${previousFixtureId}" and "${fixture.id}".`
      );
    }

    seenRoutePaths.set(fixture.routePath, fixture.id);
  }
}

assertUniqueFixtureField(highFidelityFixtureManifest, 'id');
assertUniqueFixtureField(highFidelityFixtureManifest, 'relativePath');
assertUniqueBrowserRoutePaths(highFidelityBrowserFixtureManifest);

function getBrowserFixture(id: HighFidelityBrowserFixtureId): HighFidelityBrowserFixtureDefinition {
  const fixture = highFidelityBrowserFixtureManifest.find((entry) => entry.id === id);

  if (!fixture) {
    throw new Error(`Unknown high-fidelity browser fixture: ${id}`);
  }

  return fixture;
}

function getScopedArticleFixture(
  id: HighFidelityScopedArticleFixtureId
): HighFidelityScopedArticleFixtureDefinition {
  const fixture = highFidelityScopedArticleFixtureManifest.find((entry) => entry.id === id);

  if (!fixture) {
    throw new Error(`Unknown high-fidelity scoped-article fixture: ${id}`);
  }

  return fixture;
}

async function loadFixtureHtml(definition: HighFidelityFixtureDefinition) {
  const cachedHtml = fixtureHtmlCache.get(definition.id);
  if (cachedHtml) {
    return cachedHtml;
  }

  const htmlPromise = fs.readFile(getAbsoluteFixturePath(definition.relativePath), 'utf8');
  fixtureHtmlCache.set(definition.id, htmlPromise);
  return htmlPromise;
}

export function getHighFidelityBrowserFixture(id: HighFidelityBrowserFixtureId) {
  return getBrowserFixture(id);
}

export function getHighFidelityScopedArticleFixture(id: HighFidelityScopedArticleFixtureId) {
  return getScopedArticleFixture(id);
}

export async function loadHighFidelityBrowserFixture(
  id: HighFidelityBrowserFixtureId
): Promise<LoadedHighFidelityBrowserFixture> {
  const definition = getBrowserFixture(id);

  return {
    ...definition,
    absolutePath: getAbsoluteFixturePath(definition.relativePath),
    html: await loadFixtureHtml(definition)
  };
}

export async function loadHighFidelityScopedArticleFixture(
  id: HighFidelityScopedArticleFixtureId
): Promise<LoadedHighFidelityScopedArticleFixture> {
  const definition = getScopedArticleFixture(id);

  return {
    ...definition,
    absolutePath: getAbsoluteFixturePath(definition.relativePath),
    html: await loadFixtureHtml(definition)
  };
}
