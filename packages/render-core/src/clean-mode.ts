import type {
  CleanArticleCleanupCategoryId,
  CleanArticleConfig,
  CleanArticlePreservedStructureId,
  CleanArticleReason,
  CleanArticleRequest,
  CleanArticleRootSource,
  CleanArticleStoredSettings,
  ExactExportMarginsInInches,
  ExactExportOption,
  ExactExportOrientation,
  ExactExportPageSize,
  ExactExportScalePercent,
  ExactExportTarget
} from '@pagemint/shared-types';

export interface CleanArticleCapability {
  mode: 'clean';
  label: string;
  description: string;
  defaultPresetId: 'default';
}

export const cleanArticleCapability: CleanArticleCapability = {
  mode: 'clean',
  label: 'Clean article',
  description: 'Clean the current article-like page locally into a more readable PDF surface.',
  defaultPresetId: 'default'
};

export const defaultCleanArticleConfig: CleanArticleConfig = {
  pageSize: 'A4',
  orientation: 'portrait',
  scalePercent: 100,
  includeBackgroundGraphics: true,
  marginsInInches: {
    top: 0.5,
    right: 0.5,
    bottom: 0.5,
    left: 0.5
  }
};

export const cleanArticlePageSizeOptions = [
  { value: 'A4', label: 'A4' },
  { value: 'Letter', label: 'US Letter' },
  { value: 'Legal', label: 'US Legal' }
] as const satisfies readonly ExactExportOption<ExactExportPageSize>[];

export const cleanArticleOrientationOptions = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' }
] as const satisfies readonly ExactExportOption<ExactExportOrientation>[];

const cleanArticleScaleOptions = [50, 75, 90, 100] as const satisfies readonly ExactExportScalePercent[];
const cleanArticleMarginConstraint = {
  min: 0,
  max: 2,
  step: 0.25,
  defaultValue: 0.5
} as const;

export const cleanArticleCleanupCategoryDefinitions = [
  { id: 'navigation', label: 'Navigation', description: 'Site or section navigation outside the reading flow.' },
  { id: 'header', label: 'Header chrome', description: 'Repeated site headers or top chrome.' },
  { id: 'footer', label: 'Footer chrome', description: 'Site footer chrome that does not belong to the article.' },
  { id: 'share-rail', label: 'Share rail', description: 'Floating or inline social share chrome.' },
  { id: 'newsletter', label: 'Newsletter / subscribe block', description: 'Signup forms and subscribe prompts.' },
  { id: 'consent-banner', label: 'Consent banner', description: 'Cookie or consent prompts.' },
  { id: 'promo-banner', label: 'Promo banner', description: 'Promotional bars and obvious campaign chrome.' },
  { id: 'related-content', label: 'Related content', description: 'You may also like / next article rails.' },
  { id: 'comments', label: 'Comments', description: 'Discussion or comment modules outside the article body.' },
  { id: 'chat-launcher', label: 'Chat launcher', description: 'Floating support or chat launchers.' },
  { id: 'modal-overlay', label: 'Modal overlay', description: 'Dialogs, backdrops, and interstitial blockers.' },
  { id: 'ad-slot', label: 'Advertising', description: 'Obvious ad slots and sponsored chrome.' }
] as const satisfies ReadonlyArray<{
  id: CleanArticleCleanupCategoryId;
  label: string;
  description: string;
}>;

export const cleanArticlePreservedStructureDefinitions = [
  { id: 'title', label: 'Title' },
  { id: 'deck', label: 'Deck' },
  { id: 'byline', label: 'Byline' },
  { id: 'date', label: 'Date' },
  { id: 'heading', label: 'Headings' },
  { id: 'list', label: 'Lists' },
  { id: 'figure', label: 'Figures' },
  { id: 'caption', label: 'Captions' },
  { id: 'blockquote', label: 'Blockquotes' },
  { id: 'table', label: 'Tables' },
  { id: 'code-block', label: 'Code blocks' },
  { id: 'warning', label: 'Warnings and callouts' },
  { id: 'footnote', label: 'Footnotes' },
  { id: 'inline-image', label: 'Inline images' }
] as const satisfies ReadonlyArray<{
  id: CleanArticlePreservedStructureId;
  label: string;
}>;

export type CleanArticleCandidateSource = 'article' | 'main' | 'role-main' | 'generic';

export interface CleanArticleCandidateSnapshot {
  key: string;
  selector: string;
  source: CleanArticleCandidateSource;
  textLength: number;
  paragraphCount: number;
  headingCount: number;
  figureCount: number;
  codeBlockCount: number;
  tableCount: number;
  listCount: number;
  linkTextLength: number;
  areaPx: number;
  depth: number;
  widthRatio: number;
  hasPrimaryHeading: boolean;
  competingPaneCount: number;
  ancestorKeys?: string[];
}

export interface CleanArticleDomCandidate {
  element: HTMLElement;
  snapshot: CleanArticleCandidateSnapshot;
}

export interface CleanArticleCandidateScore {
  snapshot: CleanArticleCandidateSnapshot;
  score: number;
  confidence: number;
}

export interface CleanArticleCandidateResolution {
  eligibility: 'supported' | 'unsupported' | 'best-effort';
  reason?: CleanArticleReason;
  selectedKey?: string;
  rootSource?: CleanArticleRootSource;
  rootSelector?: string;
  confidence?: number;
  scores: CleanArticleCandidateScore[];
}

const cleanArticleSemanticSelectors = [
  { selector: 'article', source: 'article' as const },
  { selector: 'main', source: 'main' as const },
  { selector: '[role="main"]', source: 'role-main' as const }
] as const;

const cleanArticleGenericSelectors = [
  'main article',
  'main section',
  'main div',
  '[role="main"] article',
  '[role="main"] section',
  '[role="main"] div',
  'article section',
  'article div',
  'body article',
  'body main',
  'body section'
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPageSize(value: unknown): value is ExactExportPageSize {
  return value === 'A4' || value === 'Letter' || value === 'Legal';
}

function isOrientation(value: unknown): value is ExactExportOrientation {
  return value === 'portrait' || value === 'landscape';
}

function normalizeScalePercent(candidate: unknown): ExactExportScalePercent {
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    return defaultCleanArticleConfig.scalePercent as ExactExportScalePercent;
  }

  const clamped = Math.min(100, Math.max(50, candidate));
  return cleanArticleScaleOptions.reduce<ExactExportScalePercent>((closest, current) => {
    return Math.abs(current - clamped) < Math.abs(closest - clamped) ? current : closest;
  }, cleanArticleScaleOptions[0]);
}

function roundToStep(value: number): number {
  return Math.round(value / cleanArticleMarginConstraint.step) * cleanArticleMarginConstraint.step;
}

function normalizeMarginValue(candidate: unknown, fallback: number): number {
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    return fallback;
  }

  const clamped = Math.min(cleanArticleMarginConstraint.max, Math.max(cleanArticleMarginConstraint.min, candidate));
  return Math.round(roundToStep(clamped) * 100) / 100;
}

function normalizeMargins(candidate: unknown): ExactExportMarginsInInches {
  const marginRecord = isRecord(candidate) ? candidate : {};

  return {
    top: normalizeMarginValue(marginRecord.top, defaultCleanArticleConfig.marginsInInches.top),
    right: normalizeMarginValue(marginRecord.right, defaultCleanArticleConfig.marginsInInches.right),
    bottom: normalizeMarginValue(marginRecord.bottom, defaultCleanArticleConfig.marginsInInches.bottom),
    left: normalizeMarginValue(marginRecord.left, defaultCleanArticleConfig.marginsInInches.left)
  };
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function getElementTextLength(element: HTMLElement): number {
  return normalizeWhitespace(element.innerText || element.textContent || '').length;
}

function getLinkTextLength(element: HTMLElement): number {
  return Array.from(element.querySelectorAll('a')).reduce((total, link) => {
    return total + normalizeWhitespace(link.textContent || '').length;
  }, 0);
}

function computeDepth(element: HTMLElement): number {
  let depth = 0;
  let current: HTMLElement | null = element;

  while (current?.parentElement) {
    depth += 1;
    current = current.parentElement;
  }

  return depth;
}

function isVisible(element: HTMLElement, windowLike: Window & typeof globalThis): boolean {
  const computed = windowLike.getComputedStyle(element);

  if (computed.display === 'none' || computed.visibility === 'hidden') {
    return false;
  }

  if (element.hidden) {
    return false;
  }

  return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

function isBannedCandidateTag(element: HTMLElement): boolean {
  return ['NAV', 'ASIDE', 'FOOTER', 'HEADER', 'FORM', 'DIALOG'].includes(element.tagName);
}

function deriveCandidateSelector(element: HTMLElement, preferredSelector: string): string {
  if (preferredSelector !== 'body section') {
    return preferredSelector;
  }

  if (element.id) {
    return `#${element.id}`;
  }

  const className = typeof element.className === 'string'
    ? element.className.trim().split(/\s+/).filter(Boolean)[0]
    : '';

  return className ? `${element.tagName.toLowerCase()}.${className}` : element.tagName.toLowerCase();
}

function countCompetingPanes(
  element: HTMLElement,
  windowLike: Window & typeof globalThis
): number {
  const parentElement = element.parentElement;

  if (!parentElement) {
    return 0;
  }

  return Array.from(parentElement.children).filter((sibling): sibling is HTMLElement => {
    const siblingElement = sibling as HTMLElement;
    return typeof siblingElement.tagName === 'string'
      && siblingElement !== element
      && isVisible(siblingElement, windowLike)
      && getElementTextLength(siblingElement) >= 80
      && (siblingElement.getBoundingClientRect().width / Math.max(windowLike.innerWidth || 1, 1)) >= 0.18;
  }).length;
}

function createCandidateSnapshot(
  element: HTMLElement,
  selector: string,
  source: CleanArticleCandidateSource,
  windowLike: Window & typeof globalThis,
  index: number
): CleanArticleCandidateSnapshot {
  const rect = element.getBoundingClientRect();
  const textLength = getElementTextLength(element);
  const widthRatio = Math.max(0, Math.min(1, rect.width / Math.max(windowLike.innerWidth || rect.width || 1, 1)));

  return {
    key: `${source}:${index}`,
    selector: deriveCandidateSelector(element, selector),
    source,
    textLength,
    paragraphCount: element.querySelectorAll('p').length,
    headingCount: element.querySelectorAll('h1, h2, h3, h4, h5, h6').length,
    figureCount: element.querySelectorAll('figure').length,
    codeBlockCount: element.querySelectorAll('pre, code').length,
    tableCount: element.querySelectorAll('table').length,
    listCount: element.querySelectorAll('ul, ol, dl').length,
    linkTextLength: getLinkTextLength(element),
    areaPx: Math.max(0, rect.width * rect.height),
    depth: computeDepth(element),
    widthRatio,
    hasPrimaryHeading: Boolean(element.querySelector('h1')),
    competingPaneCount: countCompetingPanes(element, windowLike)
  };
}

function shouldKeepGenericCandidate(candidate: CleanArticleCandidateSnapshot): boolean {
  return candidate.paragraphCount >= 3
    || (
      candidate.textLength >= 500
      && (candidate.headingCount > 0 || candidate.figureCount > 0 || candidate.tableCount > 0 || candidate.codeBlockCount > 0)
    );
}

export function collectCleanArticleDomCandidates(
  documentLike: Document = document,
  windowLike: Window & typeof globalThis = window
): CleanArticleDomCandidate[] {
  const candidates: CleanArticleDomCandidate[] = [];
  const seenElements = new Set<HTMLElement>();

  const pushCandidate = (
    element: HTMLElement,
    selector: string,
    source: CleanArticleCandidateSource
  ) => {
    if (seenElements.has(element) || isBannedCandidateTag(element) || !isVisible(element, windowLike)) {
      return;
    }

    const snapshot = createCandidateSnapshot(element, selector, source, windowLike, candidates.length);

    if (snapshot.textLength < 180) {
      return;
    }

    if (source === 'generic' && !shouldKeepGenericCandidate(snapshot)) {
      return;
    }

    seenElements.add(element);
    candidates.push({ element, snapshot });
  };

  for (const entry of cleanArticleSemanticSelectors) {
    for (const element of Array.from(documentLike.querySelectorAll<HTMLElement>(entry.selector))) {
      pushCandidate(element, entry.selector, entry.source);
    }
  }

  for (const selector of cleanArticleGenericSelectors) {
    for (const element of Array.from(documentLike.querySelectorAll<HTMLElement>(selector))) {
      if (candidates.some((candidate) => candidate.snapshot.source !== 'generic' && candidate.element.contains(element))) {
        continue;
      }

      pushCandidate(element, selector, 'generic');
    }
  }

  const filteredCandidates = candidates.filter((candidate, index, entries) => {
    if (candidate.snapshot.source !== 'generic') {
      return true;
    }

    return !entries.some((other) => (
      other !== candidate
      && other.snapshot.source === 'generic'
      && other.element.contains(candidate.element)
      && other.snapshot.textLength >= candidate.snapshot.textLength
    ));
  });

  for (const candidate of filteredCandidates) {
    candidate.snapshot.ancestorKeys = filteredCandidates
      .filter((other) => other !== candidate && other.element.contains(candidate.element))
      .map((other) => other.snapshot.key);
  }

  return filteredCandidates;
}

function scoreCandidate(snapshot: CleanArticleCandidateSnapshot): CleanArticleCandidateScore {
  const base = snapshot.source === 'article'
    ? 34
    : snapshot.source === 'main'
      ? 28
      : snapshot.source === 'role-main'
        ? 24
        : 16;
  const textScore = Math.min(40, snapshot.textLength / 55);
  const paragraphScore = Math.min(26, snapshot.paragraphCount * 4.5);
  const structureScore = Math.min(
    18,
    (snapshot.figureCount * 3) + (snapshot.codeBlockCount * 4) + (snapshot.tableCount * 5) + (snapshot.listCount * 2)
  );
  const headingScore = snapshot.hasPrimaryHeading
    ? 10
    : Math.min(8, snapshot.headingCount * 2);
  const areaScore = snapshot.areaPx >= 180_000
    ? 8
    : snapshot.areaPx >= 90_000
      ? 4
      : -6;
  const widthScore = snapshot.widthRatio < 0.22
    ? -18
    : snapshot.widthRatio <= 0.92
      ? 8
      : -4;
  const linkDensity = snapshot.linkTextLength / Math.max(snapshot.textLength, 1);
  const linkPenalty = Math.min(18, linkDensity * 36);
  const depthPenalty = snapshot.depth > 10
    ? 10
    : snapshot.depth > 7
      ? 5
      : 0;
  const score = Number((base + textScore + paragraphScore + structureScore + headingScore + areaScore + widthScore - linkPenalty - depthPenalty).toFixed(2));
  const confidence = Number(Math.max(0, Math.min(1, score / 100)).toFixed(2));

  return {
    snapshot,
    score,
    confidence
  };
}

function areCandidateSnapshotsNested(
  winner: { snapshot: CleanArticleCandidateSnapshot; element?: HTMLElement },
  runnerUp: { snapshot: CleanArticleCandidateSnapshot; element?: HTMLElement }
): boolean {
  if (
    winner.element
    && runnerUp.element
    && (
      winner.element.contains(runnerUp.element)
      || runnerUp.element.contains(winner.element)
    )
  ) {
    return true;
  }

  return Boolean(
    runnerUp.snapshot.ancestorKeys?.includes(winner.snapshot.key)
    || winner.snapshot.ancestorKeys?.includes(runnerUp.snapshot.key)
  );
}

export function resolveCleanArticleCandidate(
  candidates: readonly CleanArticleCandidateSnapshot[] | readonly CleanArticleDomCandidate[]
): CleanArticleCandidateResolution {
  if (!candidates.length) {
    return {
      eligibility: 'unsupported',
      reason: 'no-dominant-root',
      scores: []
    };
  }

  const normalizedCandidates = candidates.map((candidate) => (
    'snapshot' in candidate
      ? candidate
      : { snapshot: candidate, element: undefined }
  ));
  const scores = normalizedCandidates
    .map(({ snapshot, element }) => ({
      ...scoreCandidate(snapshot),
      element
    }))
    .sort((left, right) => right.score - left.score);
  const winner = scores[0];
  const runnerUp = scores[1];

  if (!winner) {
    return {
      eligibility: 'unsupported',
      reason: 'no-dominant-root',
      scores: scores.map(({ element: _element, ...score }) => score)
    };
  }

  if (
    runnerUp
    && runnerUp.score >= winner.score - 6
    && runnerUp.snapshot.paragraphCount >= 3
    && runnerUp.snapshot.textLength >= winner.snapshot.textLength * 0.55
    && runnerUp.snapshot.areaPx >= winner.snapshot.areaPx * 0.5
    && winner.snapshot.areaPx >= 120_000
    && !areCandidateSnapshotsNested(winner, runnerUp)
  ) {
    return {
      eligibility: 'unsupported',
      reason: 'multi-pane-layout',
      scores: scores.map(({ element: _element, ...score }) => score)
    };
  }

  if (winner.snapshot.competingPaneCount > 0 && winner.snapshot.areaPx >= 100_000) {
    return {
      eligibility: 'unsupported',
      reason: 'multi-pane-layout',
      scores: scores.map(({ element: _element, ...score }) => score)
    };
  }

  if (
    winner.snapshot.textLength < 420
    || (
      winner.snapshot.paragraphCount < 3
      && (
        winner.snapshot.headingCount
        + winner.snapshot.codeBlockCount
        + winner.snapshot.tableCount
        + winner.snapshot.listCount
      ) < 4
    )
  ) {
    return {
      eligibility: 'unsupported',
      reason: 'no-dominant-root',
      scores: scores.map(({ element: _element, ...score }) => score)
    };
  }

  if (winner.score < 56) {
    return {
      eligibility: 'unsupported',
      reason: 'low-confidence-root',
      scores: scores.map(({ element: _element, ...score }) => score)
    };
  }

  return {
    eligibility: winner.score < 64 ? 'best-effort' : 'supported',
    selectedKey: winner.snapshot.key,
    rootSource: winner.snapshot.source === 'generic' ? 'generic' : 'semantic',
    rootSelector: winner.snapshot.selector,
    confidence: winner.confidence,
    scores: scores.map(({ element: _element, ...score }) => score)
  };
}

export function collectCleanArticlePreservedStructures(
  root: ParentNode
): CleanArticlePreservedStructureId[] {
  const structures: CleanArticlePreservedStructureId[] = [];
  const push = (id: CleanArticlePreservedStructureId, selector: string) => {
    if (structures.includes(id) || !root.querySelector(selector)) {
      return;
    }

    structures.push(id);
  };

  push('title', 'h1');
  push('deck', '.deck, [data-deck], header > p');
  push('byline', '[rel="author"], .byline, [class*="author"]');
  push('date', 'time, [data-date], [class*="date"]');
  push('heading', 'h2, h3, h4, h5, h6');
  push('list', 'ul, ol, dl');
  push('figure', 'figure');
  push('caption', 'figcaption, [class*="caption"]');
  push('blockquote', 'blockquote');
  push('table', 'table');
  push('code-block', 'pre, code');
  push('warning', 'aside[role="note"], .warning, .notice, [data-callout]');
  push('footnote', 'sup a[href^="#fn"], [id^="fn"], [class*="footnote"]');
  push('inline-image', 'img');

  return structures;
}

export function normalizeCleanArticleSettings(
  candidate: unknown
): CleanArticleConfig {
  const settings = isRecord(candidate) ? candidate : {};

  return {
    pageSize: isPageSize(settings.pageSize) ? settings.pageSize : defaultCleanArticleConfig.pageSize,
    orientation: isOrientation(settings.orientation) ? settings.orientation : defaultCleanArticleConfig.orientation,
    scalePercent: normalizeScalePercent(settings.scalePercent),
    includeBackgroundGraphics:
      typeof settings.includeBackgroundGraphics === 'boolean'
        ? settings.includeBackgroundGraphics
        : defaultCleanArticleConfig.includeBackgroundGraphics,
    marginsInInches: normalizeMargins(settings.marginsInInches)
  };
}

export function buildCleanArticleRequest(
  target: ExactExportTarget,
  config: CleanArticleStoredSettings | CleanArticleConfig = defaultCleanArticleConfig,
  presetId: 'default' = cleanArticleCapability.defaultPresetId
): CleanArticleRequest {
  return {
    kind: 'clean-article.request',
    mode: cleanArticleCapability.mode,
    presetId,
    target,
    config: normalizeCleanArticleSettings(config)
  };
}

function getOrientationLabel(value: ExactExportOrientation): string {
  return cleanArticleOrientationOptions.find((option) => option.value === value)?.label ?? 'Portrait';
}

function formatInches(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2).replace(/\.00$/, '').replace(/0$/, '');
}

function describeMargins(margins: ExactExportMarginsInInches): string {
  const values = [margins.top, margins.right, margins.bottom, margins.left];

  if (values.every((value) => value === values[0])) {
    return `${formatInches(values[0] ?? 0)}in margins`;
  }

  return `margins T${formatInches(margins.top)} R${formatInches(margins.right)} B${formatInches(margins.bottom)} L${formatInches(margins.left)}in`;
}

export function describeCleanArticlePreset(
  config: CleanArticleStoredSettings | CleanArticleConfig = defaultCleanArticleConfig
): string {
  const normalizedConfig = normalizeCleanArticleSettings(config);

  return [
    'Clean article',
    normalizedConfig.pageSize,
    getOrientationLabel(normalizedConfig.orientation),
    `${normalizedConfig.scalePercent}% scale`,
    describeMargins(normalizedConfig.marginsInInches),
    normalizedConfig.includeBackgroundGraphics ? 'include background graphics' : 'skip background graphics'
  ].join(' · ');
}
