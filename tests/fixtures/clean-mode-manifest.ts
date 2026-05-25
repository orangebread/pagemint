import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  CleanArticlePreservedStructureId,
  CleanArticleReason
} from '@pagemint/shared-types';

export type CleanModeFixtureId =
  | 'article-basic'
  | 'docs-reference'
  | 'help-center'
  | 'feed-stream'
  | 'analytics-dashboard'
  | 'multi-pane-app'
  | 'search-results';

export interface CleanModeFixtureDefinition {
  id: CleanModeFixtureId;
  label: string;
  description: string;
  relativePath: string;
  expectedEligibility: 'supported' | 'unsupported';
  expectedReason?: CleanArticleReason;
  expectedStructures?: readonly CleanArticlePreservedStructureId[];
}

export interface LoadedCleanModeFixture extends CleanModeFixtureDefinition {
  absolutePath: string;
  html: string;
}

const cleanModeFixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'clean-mode'
);

export const cleanModeFixtureManifest = [
  {
    id: 'article-basic',
    label: 'Article basic',
    description: 'Dominant article layout with byline, figures, code, table, and footnotes.',
    relativePath: 'article-basic.html',
    expectedEligibility: 'supported',
    expectedStructures: ['title', 'byline', 'date', 'heading', 'figure', 'caption', 'table', 'code-block', 'footnote', 'inline-image']
  },
  {
    id: 'docs-reference',
    label: 'Docs reference',
    description: 'Reference page with one dominant docs column, lists, warning callout, and code blocks.',
    relativePath: 'docs-reference.html',
    expectedEligibility: 'supported',
    expectedStructures: ['title', 'heading', 'list', 'code-block', 'warning']
  },
  {
    id: 'help-center',
    label: 'Help center',
    description: 'Help-center article with one main reading flow and task lists.',
    relativePath: 'help-center.html',
    expectedEligibility: 'supported',
    expectedStructures: ['title', 'heading', 'list', 'inline-image']
  },
  {
    id: 'feed-stream',
    label: 'Feed stream',
    description: 'Infinite-style feed cards should not be treated as one clean article.',
    relativePath: 'feed-stream.html',
    expectedEligibility: 'unsupported',
    expectedReason: 'no-dominant-root'
  },
  {
    id: 'analytics-dashboard',
    label: 'Analytics dashboard',
    description: 'Dashboard widgets with multiple equal-weight panels should fail honestly.',
    relativePath: 'analytics-dashboard.html',
    expectedEligibility: 'unsupported',
    expectedReason: 'multi-pane-layout'
  },
  {
    id: 'multi-pane-app',
    label: 'Multi-pane app shell',
    description: 'Inbox-style shell with sidebar and detail pane should fail honestly.',
    relativePath: 'multi-pane-app.html',
    expectedEligibility: 'unsupported',
    expectedReason: 'multi-pane-layout'
  },
  {
    id: 'search-results',
    label: 'Search results',
    description: 'Search result lists remain unsupported because they are not a dominant reading document.',
    relativePath: 'search-results.html',
    expectedEligibility: 'unsupported',
    expectedReason: 'no-dominant-root'
  }
] as const satisfies readonly CleanModeFixtureDefinition[];

const fixtureCache = new Map<CleanModeFixtureId, Promise<string>>();

function getFixtureDefinition(id: CleanModeFixtureId): CleanModeFixtureDefinition {
  const fixture = cleanModeFixtureManifest.find((entry) => entry.id === id);

  if (!fixture) {
    throw new Error(`Unknown clean-mode fixture: ${id}`);
  }

  return fixture;
}

export async function loadCleanModeFixture(id: CleanModeFixtureId): Promise<LoadedCleanModeFixture> {
  const definition = getFixtureDefinition(id);
  const cachedHtml = fixtureCache.get(id) ?? fs.readFile(
    path.join(cleanModeFixtureDir, definition.relativePath),
    'utf8'
  );

  fixtureCache.set(id, cachedHtml);

  return {
    ...definition,
    absolutePath: path.join(cleanModeFixtureDir, definition.relativePath),
    html: await cachedHtml
  };
}
