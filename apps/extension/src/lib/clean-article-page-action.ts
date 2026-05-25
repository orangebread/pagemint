import type {
  CleanArticleCleanupCategoryId,
  CleanArticleConfig,
  CleanArticlePendingResult,
  CleanArticleRequest,
  CleanArticleRunMetadata
} from '@pagemint/shared-types';

export type CleanArticlePageAction =
  | { kind: 'inspect-clean-article' }
  | {
      kind: 'prepare-clean-article';
      request: CleanArticleRequest;
      selectedKey: string;
      resolution: Pick<CleanArticleRunMetadata, 'eligibility' | 'confidence' | 'rootSource' | 'rootSelector'>;
    }
  | { kind: 'cleanup-clean-article' }
  | { kind: 'launch-clean-article-print'; request: CleanArticleRequest };

export interface CleanArticlePageInspectionResult {
  ok: true;
  candidates: Array<{
    key: string;
    selector: string;
    source: 'article' | 'main' | 'role-main' | 'generic';
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
  }>;
}

export interface CleanArticlePagePrepareSuccessResult {
  ok: true;
  metadata: CleanArticleRunMetadata;
}

export interface CleanArticlePageFailureResult {
  ok: false;
  code: 'clean-article-unavailable' | 'render-failed' | 'print-launch-failed';
  message: string;
  metadata?: CleanArticleRunMetadata;
}

export type CleanArticlePageActionResult =
  | CleanArticlePageInspectionResult
  | CleanArticlePagePrepareSuccessResult
  | CleanArticlePageFailureResult
  | { ok: true };

export function createCheckingCleanArticlePendingResult(): CleanArticlePendingResult {
  return {
    kind: 'clean-article.result',
    status: 'pending',
    stage: 'checking-clean-article',
    message: 'Checking whether this page has one dominant clean-article surface.'
  };
}

export function createPreparingCleanArticlePendingResult(): CleanArticlePendingResult {
  return {
    kind: 'clean-article.result',
    status: 'pending',
    stage: 'preparing-clean-article',
    message: 'Preparing a clean article view in the active tab.'
  };
}

export function createOpeningCleanArticlePrintPendingResult(): CleanArticlePendingResult {
  return {
    kind: 'clean-article.result',
    status: 'pending',
    stage: 'opening-browser-print-dialog',
    message: 'Opening Chrome’s print dialog for the clean article output.'
  };
}

export async function runCleanArticlePageAction(
  action: CleanArticlePageAction
): Promise<CleanArticlePageActionResult> {
  type CandidateSnapshot = CleanArticlePageInspectionResult['candidates'][number];
  type ManagedStyleElement = HTMLStyleElement | HTMLLinkElement;
  type PreparationStore = {
    disabledStyles: Array<{
      element: ManagedStyleElement;
      hadMediaAttribute: boolean;
      previousMedia: string | null;
    }>;
    injectedRoot?: HTMLElement;
    injectedStyle?: HTMLStyleElement;
    printStyle?: HTMLStyleElement;
    cleanupBound?: boolean;
    cleanupTriggered?: boolean;
  };

  const exportStyleAttribute = 'data-pagemint-clean-article-style';
  const exportRootAttribute = 'data-pagemint-clean-article-root';
  const printStyleAttribute = 'data-pagemint-clean-article-print-style';
  const globalWithStore = globalThis as typeof globalThis & {
    __pagemintCleanArticlePreparation?: PreparationStore;
  };
  const windowLike = globalThis as Window & typeof globalThis;
  const documentLike = document;

  const categorySelectors: Record<CleanArticleCleanupCategoryId, readonly string[]> = {
    navigation: ['nav', '[aria-label*="Primary"]', '[class*="nav"]', '[id*="nav"]'],
    header: ['.site-header', '.site-nav', '[class*="site-header"]', '[class*="topbar"]', '[id*="header"]'],
    footer: ['footer', 'footer[role="contentinfo"]', '.site-footer', '[class*="site-footer"]'],
    'share-rail': ['[class*="share"]', '[id*="share"]', '[aria-label*="share"]'],
    newsletter: ['[class*="newsletter"]', '[class*="subscribe"]', 'form[action*="subscribe"]'],
    'consent-banner': ['[class*="cookie"]', '[class*="consent"]', '[id*="cookie"]'],
    'promo-banner': ['[class*="promo"]', '[class*="banner"]'],
    'related-content': ['[class*="related"]', '[class*="recommend"]'],
    comments: ['#comments', '[class*="comment"]'],
    'chat-launcher': ['[class*="chat"]', '[id*="chat"]', 'iframe[src*="chat"]'],
    'modal-overlay': ['dialog', '[role="dialog"]', '[aria-modal="true"]', '[class*="modal"]', '[class*="overlay"]'],
    'ad-slot': ['[class*="ad-"]', '[class*="advert"]', '[data-ad]', '[id^="ad-"]']
  };

  const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();
  const normalizeErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }

    if (typeof error === 'string' && error.trim()) {
      return error.trim();
    }

    return '';
  };

  const getStore = (): PreparationStore => {
    globalWithStore.__pagemintCleanArticlePreparation ??= {
      disabledStyles: []
    };
    return globalWithStore.__pagemintCleanArticlePreparation;
  };

  const maybeDeleteStore = () => {
    const store = globalWithStore.__pagemintCleanArticlePreparation;

    if (!store || store.cleanupBound) {
      return;
    }

    if (store.disabledStyles.length || store.injectedRoot || store.injectedStyle || store.printStyle) {
      return;
    }

    globalWithStore.__pagemintCleanArticlePreparation = undefined;
  };

  const getElementTextLength = (element: HTMLElement) => normalizeWhitespace(element.innerText || element.textContent || '').length;
  const getLinkTextLength = (element: HTMLElement) => Array.from(element.querySelectorAll('a')).reduce((total, link) => {
    return total + normalizeWhitespace(link.textContent || '').length;
  }, 0);
  const computeDepth = (element: HTMLElement) => {
    let depth = 0;
    let current: HTMLElement | null = element;

    while (current?.parentElement) {
      depth += 1;
      current = current.parentElement;
    }

    return depth;
  };
  const isVisible = (element: HTMLElement) => {
    const computed = windowLike.getComputedStyle(element);
    if (computed.display === 'none' || computed.visibility === 'hidden') {
      return false;
    }

    if (element.hidden) {
      return false;
    }

    return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
  };
  const isBannedCandidateTag = (element: HTMLElement) => ['NAV', 'ASIDE', 'FOOTER', 'HEADER', 'FORM', 'DIALOG'].includes(element.tagName);
  const deriveCandidateSelector = (element: HTMLElement, preferredSelector: string) => {
    if (preferredSelector !== 'body section') {
      return preferredSelector;
    }

    if (element.id) {
      return `#${element.id}`;
    }

    const firstClass = typeof element.className === 'string'
      ? element.className.trim().split(/\s+/).filter(Boolean)[0]
      : '';

    return firstClass ? `${element.tagName.toLowerCase()}.${firstClass}` : element.tagName.toLowerCase();
  };
  const countCompetingPanes = (element: HTMLElement) => {
    const parentElement = element.parentElement;

    if (!parentElement) {
      return 0;
    }

    return Array.from(parentElement.children).filter((sibling): sibling is HTMLElement => (
      sibling instanceof HTMLElement
      && sibling !== element
      && isVisible(sibling)
      && getElementTextLength(sibling) >= 80
      && (sibling.getBoundingClientRect().width / Math.max(windowLike.innerWidth || 1, 1)) >= 0.18
    )).length;
  };
  const createSnapshot = (
    element: HTMLElement,
    selector: string,
    source: CandidateSnapshot['source'],
    index: number
  ): CandidateSnapshot => {
    const rect = element.getBoundingClientRect();
    return {
      key: `${source}:${index}`,
      selector: deriveCandidateSelector(element, selector),
      source,
      textLength: getElementTextLength(element),
      paragraphCount: element.querySelectorAll('p').length,
      headingCount: element.querySelectorAll('h1, h2, h3, h4, h5, h6').length,
      figureCount: element.querySelectorAll('figure').length,
      codeBlockCount: element.querySelectorAll('pre, code').length,
      tableCount: element.querySelectorAll('table').length,
      listCount: element.querySelectorAll('ul, ol, dl').length,
      linkTextLength: getLinkTextLength(element),
      areaPx: Math.max(0, rect.width * rect.height),
      depth: computeDepth(element),
      widthRatio: Math.max(0, Math.min(1, rect.width / Math.max(windowLike.innerWidth || rect.width || 1, 1))),
      hasPrimaryHeading: Boolean(element.querySelector('h1')),
      competingPaneCount: countCompetingPanes(element)
    };
  };
  const shouldKeepGenericCandidate = (snapshot: CandidateSnapshot) => (
    snapshot.paragraphCount >= 3
    || (
      snapshot.textLength >= 500
      && (snapshot.headingCount > 0 || snapshot.figureCount > 0 || snapshot.tableCount > 0 || snapshot.codeBlockCount > 0)
    )
  );
  const collectCandidates = () => {
    const candidates: Array<{ element: HTMLElement; snapshot: CandidateSnapshot }> = [];
    const seenElements = new Set<HTMLElement>();
    const semanticSelectors = [
      { selector: 'article', source: 'article' as const },
      { selector: 'main', source: 'main' as const },
      { selector: '[role="main"]', source: 'role-main' as const }
    ];
    const genericSelectors = [
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
    ];

    const pushCandidate = (
      element: HTMLElement,
      selector: string,
      source: CandidateSnapshot['source']
    ) => {
      if (seenElements.has(element) || isBannedCandidateTag(element) || !isVisible(element)) {
        return;
      }

      const snapshot = createSnapshot(element, selector, source, candidates.length);

      if (snapshot.textLength < 180) {
        return;
      }

      if (source === 'generic' && !shouldKeepGenericCandidate(snapshot)) {
        return;
      }

      seenElements.add(element);
      candidates.push({ element, snapshot });
    };

    for (const entry of semanticSelectors) {
      for (const element of Array.from(documentLike.querySelectorAll<HTMLElement>(entry.selector))) {
        pushCandidate(element, entry.selector, entry.source);
      }
    }

    for (const selector of genericSelectors) {
      for (const element of Array.from(documentLike.querySelectorAll<HTMLElement>(selector))) {
        if (candidates.some((candidate) => candidate.snapshot.source !== 'generic' && candidate.element.contains(element))) {
          continue;
        }

        pushCandidate(element, selector, 'generic');
      }
    }

    const filteredCandidates = candidates.filter((candidate, _index, entries) => {
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
  };

  const collectOutsideChromeCategories = (selectedElement: HTMLElement) => {
    const categories = new Set<CleanArticleCleanupCategoryId>();

    for (const [categoryId, selectors] of Object.entries(categorySelectors) as Array<[CleanArticleCleanupCategoryId, readonly string[]]>) {
      if (selectors.some((selector) => (
        Array.from(documentLike.querySelectorAll(selector)).some((element) => (
          element instanceof HTMLElement && !selectedElement.contains(element)
        ))
      ))) {
        categories.add(categoryId);
      }
    }

    return categories;
  };

  const isProtectedStructure = (element: HTMLElement) => [
    'FIGURE',
    'FIGCAPTION',
    'TABLE',
    'THEAD',
    'TBODY',
    'TR',
    'TD',
    'TH',
    'PRE',
    'CODE',
    'BLOCKQUOTE',
    'UL',
    'OL',
    'DL',
    'LI',
    'IMG',
    'SVG',
    'SUP'
  ].includes(element.tagName);

  const removeCategoryMatches = (root: HTMLElement) => {
    const removedCategories = new Set<CleanArticleCleanupCategoryId>();

    for (const [categoryId, selectors] of Object.entries(categorySelectors) as Array<[CleanArticleCleanupCategoryId, readonly string[]]>) {
      for (const selector of selectors) {
        for (const element of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
          if (isProtectedStructure(element)) {
            continue;
          }

          if (element.closest('figure, figcaption, table, pre, code, blockquote')) {
            continue;
          }

          removedCategories.add(categoryId);
          element.remove();
        }
      }
    }

    return removedCategories;
  };

  const collectPreservedStructures = (root: ParentNode) => {
    const preservedStructures = new Set<CleanArticleRunMetadata['preservedStructures'][number]>();
    const includeIfPresent = (id: CleanArticleRunMetadata['preservedStructures'][number], selector: string) => {
      if (root.querySelector(selector)) {
        preservedStructures.add(id);
      }
    };

    includeIfPresent('title', 'h1');
    includeIfPresent('deck', '.deck, [data-deck], header > p');
    includeIfPresent('byline', '[rel="author"], .byline, [class*="author"]');
    includeIfPresent('date', 'time, [data-date], [class*="date"]');
    includeIfPresent('heading', 'h2, h3, h4, h5, h6');
    includeIfPresent('list', 'ul, ol, dl');
    includeIfPresent('figure', 'figure');
    includeIfPresent('caption', 'figcaption, [class*="caption"]');
    includeIfPresent('blockquote', 'blockquote');
    includeIfPresent('table', 'table');
    includeIfPresent('code-block', 'pre, code');
    includeIfPresent('warning', 'aside[role="note"], .warning, .notice, [data-callout]');
    includeIfPresent('footnote', 'sup a[href^="#fn"], [id^="fn"], [class*="footnote"]');
    includeIfPresent('inline-image', 'img');

    return Array.from(preservedStructures);
  };

  const disableSiteStyles = () => {
    const store = getStore();
    const styleElements = Array.from(documentLike.querySelectorAll<ManagedStyleElement>('head style, head link[rel="stylesheet"]'));

    for (const element of styleElements) {
      if (
        element.hasAttribute(exportStyleAttribute)
        || element.hasAttribute(printStyleAttribute)
      ) {
        continue;
      }

      store.disabledStyles.push({
        element,
        hadMediaAttribute: element.hasAttribute('media'),
        previousMedia: element.getAttribute('media')
      });
      element.setAttribute('media', 'not all');
    }
  };

  const restoreDisabledStyles = () => {
    const store = getStore();

    for (const entry of store.disabledStyles) {
      if (entry.hadMediaAttribute) {
        entry.element.setAttribute('media', entry.previousMedia ?? '');
      } else {
        entry.element.removeAttribute('media');
      }
    }

    store.disabledStyles = [];
  };

  const createCleanStyle = () => {
    const style = documentLike.createElement('style');
    style.setAttribute(exportStyleAttribute, 'true');
    style.textContent = [
      `body > *:not([${exportRootAttribute}="true"]):not(style[${exportStyleAttribute}="true"]):not(style[${printStyleAttribute}="true"]) { display: none !important; }`,
      `body[${exportRootAttribute}="-active"] { margin: 0 !important; background: #f6f1e8 !important; color: #15110d !important; }`,
      `[${exportRootAttribute}="true"] { box-sizing: border-box; display: block !important; width: 100%; min-height: 100vh; padding: 48px 24px 72px; background: linear-gradient(180deg, #f8f3eb 0%, #f1ebe0 100%); }`,
      `[${exportRootAttribute}="true"] .pagemint-clean-article__sheet { max-width: 760px; margin: 0 auto; padding: 40px; background: #fff; color: #15110d; box-shadow: 0 24px 60px rgba(17, 12, 8, 0.12); border-radius: 22px; font: 400 17px/1.72 Georgia, serif; }`,
      `[${exportRootAttribute}="true"] h1, [${exportRootAttribute}="true"] h2, [${exportRootAttribute}="true"] h3 { color: #15110d; line-height: 1.2; }`,
      `[${exportRootAttribute}="true"] h1 { font-size: 2.2rem; margin: 0 0 0.75rem; }`,
      `[${exportRootAttribute}="true"] h2 { margin-top: 2rem; font-size: 1.35rem; }`,
      `[${exportRootAttribute}="true"] img, [${exportRootAttribute}="true"] video { max-width: 100%; height: auto; display: block; }`,
      `[${exportRootAttribute}="true"] figure { margin: 1.75rem 0; }`,
      `[${exportRootAttribute}="true"] figcaption { color: #635948; font-size: 0.96rem; }`,
      `[${exportRootAttribute}="true"] table { width: 100%; border-collapse: collapse; }`,
      `[${exportRootAttribute}="true"] th, [${exportRootAttribute}="true"] td { border: 1px solid #d9d0c2; padding: 8px 10px; text-align: left; }`,
      `[${exportRootAttribute}="true"] pre { padding: 16px; background: #f4f1eb; overflow: auto; }`,
      `[${exportRootAttribute}="true"] code { overflow-wrap: break-word; }`,
      `[${exportRootAttribute}="true"] .warning, [${exportRootAttribute}="true"] .notice, [${exportRootAttribute}="true"] [data-callout] { border-left: 4px solid #b26a00; background: #fff7e8; padding: 14px 16px; }`
    ].join('\n');

    return style;
  };

  const cleanupAll = () => {
    const store = getStore();

    if (store.cleanupTriggered) {
      return;
    }

    store.cleanupTriggered = true;
    store.printStyle?.remove();
    store.printStyle = undefined;
    store.injectedStyle?.remove();
    store.injectedStyle = undefined;
    store.injectedRoot?.remove();
    store.injectedRoot = undefined;
    documentLike.body.removeAttribute(exportRootAttribute + '-active');
    restoreDisabledStyles();
    store.cleanupBound = false;
    store.cleanupTriggered = false;
    maybeDeleteStore();
  };

  const ensureCleanupListeners = () => {
    const store = getStore();

    if (store.cleanupBound) {
      return;
    }

    const cleanup = () => {
      cleanupAll();
    };

    windowLike.addEventListener('afterprint', cleanup, { once: true });
    windowLike.addEventListener('beforeunload', cleanup, { once: true });
    store.cleanupBound = true;
  };

  const buildPrintStyles = (config: CleanArticleConfig) => {
    const margins = config.marginsInInches;
    const zoom = Math.max(0.5, config.scalePercent / 100);
    const pageSize = `${config.pageSize} ${config.orientation}`;

    return [
      `@page { size: ${pageSize}; margin: ${margins.top}in ${margins.right}in ${margins.bottom}in ${margins.left}in; }`,
      '@media print {',
      config.includeBackgroundGraphics
        ? '  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }'
        : '  html { -webkit-print-color-adjust: economy; print-color-adjust: economy; }',
      `  body { zoom: ${zoom}; }`,
      `  [${exportRootAttribute}="true"] { padding: 0 !important; background: white !important; }`,
      `  [${exportRootAttribute}="true"] .pagemint-clean-article__sheet { box-shadow: none !important; border-radius: 0 !important; }`,
      '}'
    ].join('\n');
  };

  try {
    switch (action.kind) {
      case 'inspect-clean-article': {
        return {
          ok: true,
          candidates: collectCandidates().map((candidate) => candidate.snapshot)
        };
      }
      case 'cleanup-clean-article': {
        cleanupAll();
        return { ok: true };
      }
      case 'prepare-clean-article': {
        cleanupAll();

        const candidates = collectCandidates();
        const selectedCandidate = candidates.find((candidate) => candidate.snapshot.key === action.selectedKey);

        if (!selectedCandidate) {
          return {
            ok: false,
            code: 'clean-article-unavailable',
            message: 'PageMint could not resolve the chosen clean-article root on the live page.',
            metadata: {
              intent: 'clean-article',
              eligibility: 'unsupported',
              reason: 'cleanup-error',
              rootSource: action.resolution.rootSource,
              rootSelector: action.resolution.rootSelector,
              confidence: action.resolution.confidence,
              removedCategories: [],
              demotedCategories: [],
              preservedStructures: [],
              renderPath: 'browser-print'
            }
          };
        }

        const removedCategories = collectOutsideChromeCategories(selectedCandidate.element);
        const clone = selectedCandidate.element.cloneNode(true) as HTMLElement;
        const removedInsideClone = removeCategoryMatches(clone);
        for (const categoryId of removedInsideClone) {
          removedCategories.add(categoryId);
        }

        disableSiteStyles();

        const store = getStore();
        const style = createCleanStyle();
        store.injectedStyle = style;
        (documentLike.head ?? documentLike.documentElement).appendChild(style);

        const root = documentLike.createElement('section');
        root.setAttribute(exportRootAttribute, 'true');
        root.innerHTML = '<article class="pagemint-clean-article__sheet"></article>';
        const sheet = root.querySelector<HTMLElement>('.pagemint-clean-article__sheet');

        if (!sheet) {
          cleanupAll();
          return {
            ok: false,
            code: 'render-failed',
            message: 'PageMint could not create the clean article surface in this tab.'
          };
        }

        if (!clone.querySelector('h1') && action.request.target.title.trim()) {
          const heading = documentLike.createElement('h1');
          heading.textContent = action.request.target.title.trim();
          sheet.appendChild(heading);
        }

        while (clone.firstChild) {
          sheet.appendChild(clone.firstChild);
        }

        store.injectedRoot = root;
        documentLike.body.setAttribute(exportRootAttribute + '-active', 'true');
        documentLike.body.appendChild(root);
        ensureCleanupListeners();

        return {
          ok: true,
          metadata: {
            intent: 'clean-article',
            eligibility: action.resolution.eligibility,
            rootSource: action.resolution.rootSource,
            rootSelector: action.resolution.rootSelector,
            confidence: action.resolution.confidence,
            removedCategories: Array.from(removedCategories),
            demotedCategories: [],
            preservedStructures: collectPreservedStructures(sheet),
            renderPath: 'browser-print'
          }
        };
      }
      case 'launch-clean-article-print': {
        const store = getStore();
        const printStyle = documentLike.createElement('style');
        printStyle.setAttribute(printStyleAttribute, 'true');
        printStyle.textContent = buildPrintStyles(action.request.config);
        documentLike.head?.appendChild(printStyle);
        store.printStyle = printStyle;
        ensureCleanupListeners();

        if (typeof windowLike.print !== 'function') {
          cleanupAll();
          return {
            ok: false,
            code: 'print-launch-failed',
            message: 'Chrome print dialog is unavailable for the current tab.'
          };
        }

        try {
          windowLike.print();
          return { ok: true };
        } catch (error) {
          cleanupAll();
          return {
            ok: false,
            code: 'print-launch-failed',
            message: normalizeErrorMessage(error) || 'PageMint could not open Chrome’s print dialog for the clean article output.'
          };
        }
      }
      default:
        return {
          ok: false,
          code: 'render-failed',
          message: 'Unsupported clean article page action.'
        };
    }
  } catch (error) {
    if (action.kind !== 'inspect-clean-article') {
      cleanupAll();
    }

    return {
      ok: false,
      code: action.kind === 'launch-clean-article-print' ? 'print-launch-failed' : 'render-failed',
      message: normalizeErrorMessage(error) || 'PageMint could not prepare the clean article output for this tab.'
    };
  }
}
