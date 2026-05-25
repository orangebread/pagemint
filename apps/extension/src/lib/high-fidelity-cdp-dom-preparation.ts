import type {
  ExactExportContentScopeRunMetadata,
  ExactExportRequest
} from '@pagemint/shared-types';

import {
  genericContentScopeSelectors,
  matchContentScopeAdapterForUrl,
  type SerializableContentScopeAdapter,
  type SerializableContentScopeSelectorSet
} from './high-fidelity-content-scope';
import {
  executeScriptInTab
} from './extension-script-runtime';
import {
  assertHighFidelityDomPreparationResult,
  raceWithHighFidelityTimeout,
  type HighFidelityDomPreparationResult,
  type HighFidelityRuntimeSnapshot,
  type HighFidelityScriptingLike
} from './high-fidelity-cdp-support';

type HighFidelityDomPreparationAction =
  | {
      kind: 'prepare-high-fidelity-dom';
      request: ExactExportRequest;
      adapter: SerializableContentScopeAdapter | null;
      selectors: SerializableContentScopeSelectorSet;
      genericSelectors: SerializableContentScopeSelectorSet;
    }
  | { kind: 'cleanup-high-fidelity-dom' };

interface HighFidelityRuntimeSnapshotAction {
  kind: 'read-high-fidelity-runtime-snapshot';
}

function runHighFidelityDomPreparationAction(
  action: HighFidelityDomPreparationAction
): HighFidelityDomPreparationResult | void {
  type PreparationStore = {
    originalStyles: Map<HTMLElement, string | null>;
    originalAttributesByElement: Map<HTMLElement, Map<string, {
      hadAttribute: boolean;
      previousValue: string | null;
    }>>;
    injectedStyleElements: Set<HTMLElement>;
  };

  const exportStyleMarkerAttribute = 'data-pagemint-high-fidelity-export-style';
  const cssPixelsPerInchForPreparation = 96;
  const exportStyles = [
    '*{transition:none!important;animation:none!important}',
    'noscript{display:none!important}',
    'pre,code{overflow-wrap:break-word!important;white-space:pre-wrap!important;word-break:break-word!important;height:fit-content!important;max-height:fit-content!important}',
    '::-webkit-scrollbar{display:none!important}',
    '[data-pagemint-scoped-root="true"] h1,[data-pagemint-scoped-root="true"] h2,[data-pagemint-scoped-root="true"] h3,[data-pagemint-scoped-root="true"] h4,[data-pagemint-scoped-root="true"] h5,[data-pagemint-scoped-root="true"] h6{break-after:avoid-page!important;page-break-after:avoid!important}',
    '[data-pagemint-scoped-root="true"] figure,[data-pagemint-scoped-root="true"] blockquote,[data-pagemint-scoped-root="true"] pre,[data-pagemint-scoped-root="true"] table,[data-pagemint-scoped-root="true"] ul,[data-pagemint-scoped-root="true"] ol,[data-pagemint-scoped-root="true"] [data-pagemint-keep-together="true"]{break-inside:avoid-page!important;page-break-inside:avoid!important}'
  ].join('');
  const globalWithStore = globalThis as typeof globalThis & {
    __pagemintHighFidelityDomPreparation?: PreparationStore;
  };
  const windowLike = globalThis;
  const documentLike = document;

  const defaultBenchmarkCounters = {
    commentLeakageCount: 0,
    recommendationLeakageCount: 0,
    repeatedChromeCount: 0,
    orphanHeadingCount: 0,
    splitFigureCount: 0
  };
  const defaultSupplements: ExactExportContentScopeRunMetadata['supplements'] = {
    comments: 'ignored',
    recommendations: 'ignored',
    footer: 'ignored'
  };
  const fixedChromeKeywordPattern = /\b(cookie|consent|banner|promo|subscribe|newsletter|chat|launcher|widget|share|social|intercom|modal|dialog|popover|toast|survey|feedback|gdpr|privacy|player|audio|video|toolbar|controls)\b/i;

  const inferFallbackReasonFromPreparationState = (options: {
    hadCandidate: boolean;
    hadSelectorMatch: boolean;
    rootTextLength: number;
    rootAreaPx: number;
  }) => {
    if (!options.hadSelectorMatch) {
      return 'root-selector-empty' as const;
    }

    if (!options.hadCandidate) {
      return 'adapter-miss' as const;
    }

    if (options.rootTextLength < 500 || options.rootAreaPx < 120_000) {
      return 'root-too-small' as const;
    }

    return 'low-confidence-root' as const;
  };

  const paperDimensionsInInches = {
    A4: { width: 8.27, height: 11.69 },
    Letter: { width: 8.5, height: 11 },
    Legal: { width: 8.5, height: 14 }
  };

  const restoreStore = (store?: PreparationStore) => {
    if (!store) {
      return;
    }

    store.originalStyles.forEach((previousInlineStyle, element) => {
      if (previousInlineStyle === null) {
        element.removeAttribute('style');
        return;
      }

      element.setAttribute('style', previousInlineStyle);
    });
    store.originalStyles.clear();
    store.injectedStyleElements.forEach((styleElement) => {
      styleElement.remove();
    });
    store.injectedStyleElements.clear();
    for (const [element, attributeSnapshots] of store.originalAttributesByElement) {
      for (const [name, attributeSnapshot] of attributeSnapshots) {
        if (attributeSnapshot.hadAttribute) {
          element.setAttribute(name, attributeSnapshot.previousValue ?? '');
          continue;
        }

        element.removeAttribute(name);
      }
    }
    store.originalAttributesByElement.clear();
  };

  if (action.kind === 'cleanup-high-fidelity-dom') {
    restoreStore(globalWithStore.__pagemintHighFidelityDomPreparation);
    globalWithStore.__pagemintHighFidelityDomPreparation = undefined;
    return;
  }

  const getPrintablePageWidthCssPx = () => {
    if (action.request.config.layout !== 'paginated') {
      return 0;
    }

    const pageSize = paperDimensionsInInches[action.request.config.pageSize];
    const paperWidthInInches = action.request.config.orientation === 'portrait'
      ? pageSize.width
      : pageSize.height;
    const printableWidthInInches = Math.max(
      1,
      paperWidthInInches
        - action.request.config.marginsInInches.left
        - action.request.config.marginsInInches.right
    );

    return Math.round(printableWidthInInches * cssPixelsPerInchForPreparation);
  };

  const rememberInlineStyle = (store: PreparationStore, element: HTMLElement) => {
    if (!store.originalStyles.has(element)) {
      store.originalStyles.set(element, element.getAttribute('style'));
    }
  };
  const rememberAttribute = (store: PreparationStore, element: HTMLElement, name: string) => {
    let attributeSnapshots = store.originalAttributesByElement.get(element);

    if (!attributeSnapshots) {
      attributeSnapshots = new Map();
      store.originalAttributesByElement.set(element, attributeSnapshots);
    }

    if (attributeSnapshots.has(name)) {
      return;
    }

    attributeSnapshots.set(name, {
      hadAttribute: element.hasAttribute(name),
      previousValue: element.getAttribute(name)
    });
  };
  const setInline = (store: PreparationStore, element: HTMLElement, property: string, value: string) => {
    rememberInlineStyle(store, element);
    element.style.setProperty(property, value, 'important');
  };
  const setAttribute = (store: PreparationStore, element: HTMLElement, name: string, value: string) => {
    rememberAttribute(store, element, name);
    element.setAttribute(name, value);
  };
  const isVisible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const computed = windowLike.getComputedStyle(element);
    if (computed.display === 'none' || computed.visibility === 'hidden') {
      return false;
    }

    if (element.hidden) {
      return false;
    }

    return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
  };
  const queryFirstVisible = (selectorsToTry: readonly string[], root: ParentNode = documentLike) => {
    for (const selector of selectorsToTry) {
      let elements: NodeListOf<Element>;

      try {
        elements = root.querySelectorAll(selector);
      } catch {
        continue;
      }

      for (const element of Array.from(elements)) {
        if (isVisible(element)) {
          return {
            element,
            selector
          };
        }
      }
    }

    return null;
  };
  const queryAllSafe = (selectorsToTry: readonly string[], root: ParentNode = documentLike) => {
    const matches = new Set<Element>();

    for (const selector of selectorsToTry) {
      let elements: NodeListOf<Element>;

      try {
        elements = root.querySelectorAll(selector);
      } catch {
        continue;
      }

      for (const element of Array.from(elements)) {
        matches.add(element);
      }
    }

    return Array.from(matches);
  };
  const collectTopLevelVisibleMatches = (
    root: HTMLElement,
    selectorsToTry: readonly string[]
  ) => {
    const visibleMatches = queryAllSafe(selectorsToTry, root)
      .filter((element): element is HTMLElement => (
        element instanceof HTMLElement
        && element !== root
        && isVisible(element)
      ));

    return visibleMatches.filter((candidate) => !visibleMatches.some((other) => (
      other !== candidate
      && other.contains(candidate)
    )));
  };
  const collectCandidateMetrics = (
    element: HTMLElement,
    stopSelectorsToTry: readonly string[] = []
  ) => {
    const rect = element.getBoundingClientRect();
    const textLength = (element.innerText ?? element.textContent ?? '').replace(/\s+/g, ' ').trim().length;
    const semanticBlockCount = element.querySelectorAll('p,li,figure,blockquote,pre,table,h1,h2,h3').length;
    const area = Math.round(rect.width * rect.height);
    const stopMatches = collectTopLevelVisibleMatches(element, stopSelectorsToTry);
    const stopPenalty = stopMatches.reduce((totalPenalty, stopElement) => {
      const stopRect = stopElement.getBoundingClientRect();
      const stopTextLength = (stopElement.innerText ?? stopElement.textContent ?? '').replace(/\s+/g, ' ').trim().length;
      const stopSemanticBlockCount = stopElement.querySelectorAll('p,li,figure,blockquote,pre,table,h1,h2,h3').length;
      const stopArea = Math.round(stopRect.width * stopRect.height);

      return totalPenalty + stopTextLength + stopSemanticBlockCount * 80 + stopArea / 1_000 + 400;
    }, 0);
    const score = textLength + semanticBlockCount * 80 + area / 1_000 + (element.tagName === 'ARTICLE' ? 800 : 0) - stopPenalty;

    return {
      textLength,
      semanticBlockCount,
      area,
      score,
      stopPenalty
    };
  };
  const pickBestRoot = (
    selectorsToTry: readonly string[],
    stopSelectorsToTry: readonly string[] = []
  ) => {
    let bestMatch: {
      element: HTMLElement;
      selector: string;
      textLength: number;
      semanticBlockCount: number;
      area: number;
      score: number;
      stopPenalty: number;
    } | null = null;
    let hadSelectorMatch = false;

    for (const selector of selectorsToTry) {
      let elements: NodeListOf<Element>;

      try {
        elements = documentLike.querySelectorAll(selector);
      } catch {
        continue;
      }

      if (elements.length) {
        hadSelectorMatch = true;
      }

      for (const element of Array.from(elements)) {
        if (!isVisible(element)) {
          continue;
        }

        const metrics = collectCandidateMetrics(element, stopSelectorsToTry);
        const nextMatch = {
          element,
          selector,
          ...metrics
        };

        if (!bestMatch || nextMatch.score > bestMatch.score) {
          bestMatch = nextMatch;
        }
      }
    }

    return {
      bestMatch,
      hadSelectorMatch
    };
  };
  const hasConfidentScopedRoot = (candidate: ReturnType<typeof collectCandidateMetrics> | null) => {
    if (!candidate) {
      return false;
    }

    return candidate.textLength >= 900
      || candidate.semanticBlockCount >= 10
      || (candidate.textLength >= 500 && candidate.area >= 180_000);
  };
  const branchContainsPreserved = (element: HTMLElement, preservedLeaves: readonly HTMLElement[]) => {
    return preservedLeaves.some((leaf) => element === leaf || element.contains(leaf));
  };
  const intersectsPreservedSubtree = (element: HTMLElement, preservedLeaves: readonly HTMLElement[]) => {
    return preservedLeaves.some((leaf) => (
      element === leaf
      || element.contains(leaf)
      || leaf.contains(element)
    ));
  };
  const hideUnrelatedBranches = (
    store: PreparationStore,
    element: HTMLElement,
    preservedLeaves: readonly HTMLElement[]
  ) => {
    if (preservedLeaves.some((leaf) => element === leaf || leaf.contains(element))) {
      return;
    }

    for (const child of Array.from(element.children)) {
      if (!(child instanceof HTMLElement)) {
        continue;
      }

      if (!branchContainsPreserved(child, preservedLeaves)) {
        setInline(store, child, 'display', 'none');
        continue;
      }

      hideUnrelatedBranches(store, child, preservedLeaves);
    }
  };
  const normalizeAncestorChain = (store: PreparationStore, root: HTMLElement) => {
    let current = root.parentElement;

    while (current) {
      const computed = windowLike.getComputedStyle(current);
      if (computed.display === 'flex' || computed.display === 'inline-flex' || computed.display === 'grid' || computed.display === 'inline-grid') {
        setInline(store, current, 'display', 'block');
      }
      if (computed.position === 'fixed' || computed.position === 'sticky') {
        setInline(store, current, 'position', 'static');
      }
      if (computed.transform !== 'none') {
        setInline(store, current, 'transform', 'none');
      }
      if (computed.overflowX !== 'visible' || computed.overflowY !== 'visible') {
        setInline(store, current, 'overflow', 'visible');
      }
      if (computed.contain !== 'none') {
        setInline(store, current, 'contain', 'none');
      }
      setInline(store, current, 'margin', '0');
      setInline(store, current, 'padding', '0');
      setInline(store, current, 'max-width', 'none');
      setInline(store, current, 'width', 'auto');
      setInline(store, current, 'background', 'transparent');
      setInline(store, current, 'border', '0');
      setInline(store, current, 'box-shadow', 'none');
      current = current.parentElement;
    }
  };
  const stabilizeRootWrapper = (store: PreparationStore, root: HTMLElement) => {
    const rect = root.getBoundingClientRect();
    const printableWidthCssPx = getPrintablePageWidthCssPx();
    const targetWidth = printableWidthCssPx > 0
      ? printableWidthCssPx
      : rect.width > 0
        ? Math.ceil(rect.width)
        : 0;

    if (targetWidth > 0) {
      setInline(store, root, 'box-sizing', 'border-box');
      setInline(store, root, 'width', `${targetWidth}px`);
      setInline(store, root, 'max-width', `${targetWidth}px`);
    }
    setInline(store, root, 'margin-top', '0');
    setInline(store, root, 'margin-bottom', '0');
    setInline(store, root, 'margin-left', 'auto');
    setInline(store, root, 'margin-right', 'auto');
    setInline(store, root, 'transform', 'none');
    setInline(store, root, 'background', '#fff');
    setInline(store, root, 'border', '0');
    setInline(store, root, 'border-radius', '0');
    setInline(store, root, 'box-shadow', 'none');
  };
  const suppressRepeatedChrome = (store: PreparationStore, preservedLeaves: readonly HTMLElement[]) => {
    const viewportWidth = Math.max(
      1,
      windowLike.innerWidth || documentLike.documentElement?.clientWidth || documentLike.body?.clientWidth || 0
    );
    const viewportHeight = Math.max(
      1,
      windowLike.innerHeight || documentLike.documentElement?.clientHeight || documentLike.body?.clientHeight || 0
    );

    const classifySuppression = (
      element: HTMLElement,
      computedPosition: string
    ): 'hide' | 'static' => {
      const rect = element.getBoundingClientRect();
      const tagName = element.tagName.toLowerCase();
      const role = element.getAttribute('role')?.toLowerCase() ?? '';
      const description = [
        element.id,
        element.className,
        element.getAttribute('aria-label'),
        element.getAttribute('data-testid'),
        role
      ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join(' ');
      const isAnchoredTop = rect.top <= 24;
      const isAnchoredBottom = rect.bottom >= viewportHeight - 24;
      const isAnchoredLeft = rect.left <= 24;
      const isAnchoredRight = rect.right >= viewportWidth - 24;
      const isWideChrome = rect.width >= viewportWidth * 0.5 && rect.height <= viewportHeight * 0.45;
      const isCornerWidget = (isAnchoredTop || isAnchoredBottom)
        && (isAnchoredLeft || isAnchoredRight)
        && rect.width <= viewportWidth * 0.35
        && rect.height <= viewportHeight * 0.35;
      const isChromeLike = tagName === 'header'
        || tagName === 'nav'
        || tagName === 'footer'
        || role === 'banner'
        || role === 'navigation'
        || role === 'contentinfo'
        || role === 'dialog'
        || role === 'alertdialog'
        || fixedChromeKeywordPattern.test(description);

      if (computedPosition === 'fixed' && (isChromeLike || isWideChrome || isCornerWidget)) {
        return 'hide';
      }

      if (computedPosition === 'sticky' && (isChromeLike || (isWideChrome && (isAnchoredTop || isAnchoredBottom)))) {
        return 'hide';
      }

      return 'static';
    };

    for (const element of Array.from(documentLike.querySelectorAll<HTMLElement>('*'))) {
      const computedPosition = windowLike.getComputedStyle(element).position;
      if (computedPosition !== 'fixed' && computedPosition !== 'sticky') {
        continue;
      }

      if (intersectsPreservedSubtree(element, preservedLeaves)) {
        continue;
      }

      const suppression = classifySuppression(element, computedPosition);
      if (suppression === 'hide') {
        setInline(store, element, 'display', 'none');
        continue;
      }

      setInline(store, element, 'position', 'static');
      setInline(store, element, 'top', 'auto');
      setInline(store, element, 'right', 'auto');
      setInline(store, element, 'bottom', 'auto');
      setInline(store, element, 'left', 'auto');
      setInline(store, element, 'transform', 'none');
      setInline(store, element, 'z-index', 'auto');
    }
  };
  const describeQualityCandidate = (element: HTMLElement) => {
    const tagName = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id.slice(0, 40)}` : '';
    const classes = typeof element.className === 'string'
      ? element.className
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .map((className) => `.${className.slice(0, 32)}`)
        .join('')
      : '';
    const label = element.getAttribute('aria-label')
      ?? element.getAttribute('data-testid')
      ?? element.getAttribute('role')
      ?? '';

    return `${tagName}${id}${classes}${label ? ` (${label.slice(0, 60)})` : ''}`;
  };
  const createWholePageQualitySnapshot = () => {
    const viewportWidth = Math.max(
      1,
      windowLike.innerWidth || documentLike.documentElement?.clientWidth || documentLike.body?.clientWidth || 0
    );
    const viewportHeight = Math.max(
      1,
      windowLike.innerHeight || documentLike.documentElement?.clientHeight || documentLike.body?.clientHeight || 0
    );
    const documentElement = documentLike.documentElement;
    const body = documentLike.body;
    const documentHeight = Math.max(
      documentElement?.scrollHeight ?? 0,
      documentElement?.offsetHeight ?? 0,
      documentElement?.clientHeight ?? 0,
      body?.scrollHeight ?? 0,
      body?.offsetHeight ?? 0,
      body?.clientHeight ?? 0,
      viewportHeight
    );
    const contentHeight = Math.max(body?.scrollHeight ?? 0, documentHeight);
    const candidates: Array<{ area: number; descriptor: string }> = [];
    let totalOverlayArea = 0;

    for (const element of Array.from(documentLike.querySelectorAll<HTMLElement>('*'))) {
      if (!isVisible(element)) {
        continue;
      }

      const computed = windowLike.getComputedStyle(element);
      if (computed.position !== 'fixed' && computed.position !== 'sticky') {
        continue;
      }

      const rect = element.getBoundingClientRect();
      const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
      const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
      const visibleArea = visibleWidth * visibleHeight;
      if (visibleArea <= 0) {
        continue;
      }

      const tagName = element.tagName.toLowerCase();
      const role = element.getAttribute('role')?.toLowerCase() ?? '';
      const description = [
        element.id,
        element.className,
        element.getAttribute('aria-label'),
        element.getAttribute('data-testid'),
        role
      ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join(' ');
      const isAnchoredTop = rect.top <= 24;
      const isAnchoredBottom = rect.bottom >= viewportHeight - 24;
      const isAnchoredLeft = rect.left <= 24;
      const isAnchoredRight = rect.right >= viewportWidth - 24;
      const isWideChrome = rect.width >= viewportWidth * 0.45 && rect.height <= viewportHeight * 0.5;
      const isCornerWidget = (isAnchoredTop || isAnchoredBottom)
        && (isAnchoredLeft || isAnchoredRight)
        && rect.width <= viewportWidth * 0.4
        && rect.height <= viewportHeight * 0.4;
      const isChromeLike = tagName === 'header'
        || tagName === 'nav'
        || tagName === 'footer'
        || role === 'banner'
        || role === 'navigation'
        || role === 'contentinfo'
        || role === 'dialog'
        || role === 'alertdialog'
        || fixedChromeKeywordPattern.test(description);

      if (!isChromeLike && !isWideChrome && !isCornerWidget) {
        continue;
      }

      totalOverlayArea += visibleArea;
      candidates.push({
        area: visibleArea,
        descriptor: describeQualityCandidate(element)
      });
    }

    return {
      visibleTextLength: (body?.innerText ?? body?.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .length,
      documentHeight,
      contentHeight,
      viewportHeight,
      fixedStickyChromeCount: candidates.length,
      fixedStickyChromeAreaRatio: Math.min(1, totalOverlayArea / Math.max(1, viewportWidth * viewportHeight)),
      dominantOverlayCandidates: candidates
        .sort((left, right) => right.area - left.area)
        .slice(0, 5)
        .map((candidate) => candidate.descriptor)
    };
  };
  const resolveSupplement = (
    selectorsToTry: readonly string[],
    include: boolean,
    root: HTMLElement
  ) => {
    const match = queryFirstVisible(selectorsToTry);

    if (!match) {
      return {
        node: null,
        status: include ? 'not-found' : 'omitted'
      } as const;
    }

    if (include) {
      return {
        node: match.element instanceof HTMLElement && !root.contains(match.element) ? match.element : null,
        status: 'included'
      } as const;
    }

    if (match.element instanceof HTMLElement && root.contains(match.element)) {
      setInline(store, match.element, 'display', 'none');
    }

    return {
      node: null,
      status: 'omitted'
    } as const;
  };
  const getPrintablePageHeightCssPx = () => {
    if (action.request.config.layout !== 'paginated') {
      return 0;
    }

    const pageSize = paperDimensionsInInches[action.request.config.pageSize];
    const paperHeightInInches = action.request.config.orientation === 'portrait'
      ? pageSize.height
      : pageSize.width;
    const printableHeightInInches = Math.max(
      1,
      paperHeightInInches
        - action.request.config.marginsInInches.top
        - action.request.config.marginsInInches.bottom
    );

    return Math.round(printableHeightInInches * cssPixelsPerInchForPreparation);
  };
  const findNextSemanticBlock = (element: HTMLElement, root: HTMLElement) => {
    const walker = documentLike.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let foundCurrent = false;

    while (walker.nextNode()) {
      const current = walker.currentNode;
      if (!(current instanceof HTMLElement)) {
        continue;
      }

      if (!foundCurrent) {
        if (current === element) {
          foundCurrent = true;
        }
        continue;
      }

      if (current.matches('p,ul,ol,figure,blockquote,pre,table')) {
        return current;
      }
    }

    return null;
  };
  const pageIndexForOffset = (offsetTop: number, startTop: number, pageHeightCssPx: number) => {
    if (pageHeightCssPx <= 0) {
      return 0;
    }

    return Math.max(0, Math.floor((offsetTop - startTop) / pageHeightCssPx));
  };
  const computeBenchmarkSnapshot = (
    root: HTMLElement | null,
    includeComments: boolean,
    includeRecommendations: boolean,
    includeFooter: boolean,
    preservedLeaves: readonly HTMLElement[]
  ) => {
    const pageHeightCssPx = getPrintablePageHeightCssPx();
    const counters = { ...defaultBenchmarkCounters };

    if (root) {
      const rootTop = root.getBoundingClientRect().top + windowLike.scrollY;

      if (!includeComments) {
        counters.commentLeakageCount = queryAllSafe(action.selectors.commentSelectors)
          .filter((element) => isVisible(element) && !root.contains(element))
          .length;
      }

      if (!includeRecommendations) {
        counters.recommendationLeakageCount = queryAllSafe(action.selectors.recommendationSelectors)
          .filter((element) => isVisible(element) && !root.contains(element))
          .length;
      }

      counters.repeatedChromeCount = Array.from(
        documentLike.querySelectorAll<HTMLElement>('header, nav, footer, [role="banner"], [role="navigation"], [role="contentinfo"]')
      ).filter((element) => isVisible(element) && !intersectsPreservedSubtree(element, preservedLeaves))
        .length;

      if (pageHeightCssPx > 0) {
        for (const heading of Array.from(root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'))) {
          if (!isVisible(heading)) {
            continue;
          }

          const nextBlock = findNextSemanticBlock(heading, root);
          if (!nextBlock || !isVisible(nextBlock)) {
            continue;
          }

          const headingBottom = heading.getBoundingClientRect().bottom + windowLike.scrollY;
          const headingPage = pageIndexForOffset(headingBottom, rootTop, pageHeightCssPx);
          const nextBlockPage = pageIndexForOffset(
            nextBlock.getBoundingClientRect().top + windowLike.scrollY,
            rootTop,
            pageHeightCssPx
          );

          if (headingPage !== nextBlockPage) {
            counters.orphanHeadingCount += 1;
          }
        }

        for (const figure of Array.from(root.querySelectorAll<HTMLElement>('figure'))) {
          if (!isVisible(figure)) {
            continue;
          }

          const media = figure.querySelector<HTMLElement>('img,svg,canvas,video,picture');
          const caption = figure.querySelector<HTMLElement>('figcaption');
          if (!media || !caption || !isVisible(media) || !isVisible(caption)) {
            continue;
          }

          const mediaPage = pageIndexForOffset(
            media.getBoundingClientRect().bottom + windowLike.scrollY,
            rootTop,
            pageHeightCssPx
          );
          const captionPage = pageIndexForOffset(
            caption.getBoundingClientRect().top + windowLike.scrollY,
            rootTop,
            pageHeightCssPx
          );

          if (mediaPage !== captionPage) {
            counters.splitFigureCount += 1;
          }
        }
      }
    }

    return {
      counters,
      pageHeightCssPx,
      estimatedPageCount: root && pageHeightCssPx > 0
        ? Math.max(
            1,
            Math.ceil((root.getBoundingClientRect().height || root.scrollHeight || 1) / pageHeightCssPx)
          )
        : 1,
      snapshotHtml: (documentLike.body?.innerHTML ?? '').slice(0, 200_000)
    };
  };

  restoreStore(globalWithStore.__pagemintHighFidelityDomPreparation);

  const store: PreparationStore = {
    originalStyles: new Map(),
    originalAttributesByElement: new Map(),
    injectedStyleElements: new Set()
  };

  globalWithStore.__pagemintHighFidelityDomPreparation = store;

  if (!document.querySelector(`style[${exportStyleMarkerAttribute}="true"]`)) {
    const style = document.createElement('style');
    style.setAttribute(exportStyleMarkerAttribute, 'true');
    style.textContent = exportStyles;
    (document.head ?? document.documentElement).appendChild(style);
    store.injectedStyleElements.add(style);
  }

  const requestedMode: ExactExportContentScopeRunMetadata['requestedMode'] =
    action.request.config.contentScope.mode;
  const effectiveMode = requestedMode;
  const adapter = action.adapter;

  if (requestedMode === 'full-page') {
    const wholePageQuality = createWholePageQualitySnapshot();
    suppressRepeatedChrome(store, []);

    return {
      contentScope: {
        requestedMode,
        effectiveMode,
        resolvedMode: 'full-page',
        supportedPageFamily: Boolean(adapter),
        supplements: defaultSupplements,
        paginationProfile: 'default'
      },
      benchmark: computeBenchmarkSnapshot(
        documentLike.body,
        false,
        false,
        false,
        []
      ),
      wholePageQuality
    };
  }

  const scopedRootAttempt = pickBestRoot(
    action.adapter?.rootSelectors ?? [],
    action.adapter?.stopSelectors ?? []
  );
  const genericRootAttempt = pickBestRoot(
    action.genericSelectors.rootSelectors,
    action.genericSelectors.stopSelectors
  );
  const rootMatch = !scopedRootAttempt.bestMatch
    ? genericRootAttempt.bestMatch
    : !genericRootAttempt.bestMatch
      ? scopedRootAttempt.bestMatch
      : scopedRootAttempt.bestMatch.score >= genericRootAttempt.bestMatch.score
        ? scopedRootAttempt.bestMatch
        : genericRootAttempt.bestMatch;
  const rootSource = rootMatch
    ? action.adapter && scopedRootAttempt.bestMatch?.element === rootMatch.element
      ? 'adapter'
      : 'generic'
    : 'fallback-full-page';
  const confidentRoot = rootMatch && hasConfidentScopedRoot(rootMatch);
  const fallbackReason = !rootMatch
    ? (action.adapter ? 'adapter-miss' : 'root-selector-empty')
    : !confidentRoot
      ? inferFallbackReasonFromPreparationState({
          hadCandidate: Boolean(rootMatch),
          hadSelectorMatch: scopedRootAttempt.hadSelectorMatch || genericRootAttempt.hadSelectorMatch,
          rootTextLength: rootMatch.textLength,
          rootAreaPx: rootMatch.area
        })
      : undefined;

  if (!rootMatch || !confidentRoot) {
    suppressRepeatedChrome(store, []);

    return {
      contentScope: {
        requestedMode,
        effectiveMode,
        outcome: requestedMode === 'article' ? 'unsupported' : 'fell-back',
        resolvedMode: 'full-page',
        rootSource: 'fallback-full-page',
        fellBackReason: fallbackReason,
        adapter: adapter ? { id: adapter.id, version: adapter.version } : undefined,
        supportedPageFamily: Boolean(adapter),
        supplements: defaultSupplements,
        paginationProfile: 'default'
      },
      benchmark: computeBenchmarkSnapshot(
        documentLike.body,
        false,
        false,
        false,
        []
      )
    };
  }

  const root = rootMatch.element;
  const comments = resolveSupplement(
    action.selectors.commentSelectors,
    action.request.config.contentScope.includeComments,
    root
  );
  const recommendations = resolveSupplement(
    action.selectors.recommendationSelectors,
    action.request.config.contentScope.includeRecommendations,
    root
  );
  const footer = resolveSupplement(
    action.selectors.footerSelectors,
    action.request.config.contentScope.includeFooter,
    root
  );
  const preservedLeaves = [
    root,
    comments.node,
    recommendations.node,
    footer.node
  ].filter((element): element is HTMLElement => element instanceof HTMLElement);

  hideUnrelatedBranches(store, documentLike.body ?? documentLike.documentElement, preservedLeaves);
  normalizeAncestorChain(store, root);
  stabilizeRootWrapper(store, root);
  setAttribute(store, root, 'data-pagemint-scoped-root', 'true');
  suppressRepeatedChrome(store, preservedLeaves);
  setInline(store, documentLike.documentElement, 'background', '#fff');
  if (documentLike.body) {
    setInline(store, documentLike.body, 'background', '#fff');
    setInline(store, documentLike.body, 'margin', '0');
  }

  return {
    contentScope: {
      requestedMode,
      effectiveMode,
      outcome: 'scoped',
      resolvedMode: 'scoped-content',
      rootSource,
      adapter: adapter ? { id: adapter.id, version: adapter.version } : undefined,
      rootSelector: rootMatch.selector,
      supportedPageFamily: Boolean(adapter),
      supplements: {
        comments: comments.status,
        recommendations: recommendations.status,
        footer: footer.status
      },
      paginationProfile: 'article'
    },
    benchmark: computeBenchmarkSnapshot(
      root,
      action.request.config.contentScope.includeComments,
      action.request.config.contentScope.includeRecommendations,
      action.request.config.contentScope.includeFooter,
      preservedLeaves
    )
  };
}

function readHighFidelityRuntimeSnapshotInTab(
  action: HighFidelityRuntimeSnapshotAction
): HighFidelityRuntimeSnapshot | null {
  if (action.kind !== 'read-high-fidelity-runtime-snapshot') {
    return null;
  }

  return {
    href: globalThis.location?.href ?? '',
    readyState: document.readyState,
    hasBody: Boolean(document.body),
    title: document.title ?? '',
    visibilityState: document.visibilityState
  };
}

export async function readHighFidelityRuntimeSnapshot(
  tabId: number,
  scripting: HighFidelityScriptingLike,
  timeoutMs: number
): Promise<HighFidelityRuntimeSnapshot | null> {
  try {
    return await raceWithHighFidelityTimeout(
      executeScriptInTab(scripting, tabId, readHighFidelityRuntimeSnapshotInTab, [
        { kind: 'read-high-fidelity-runtime-snapshot' }
      ]),
      timeoutMs
    );
  } catch {
    return null;
  }
}

export async function applyHighFidelityDomPreparation(
  tabId: number,
  scripting: HighFidelityScriptingLike,
  request: ExactExportRequest,
  timeoutMs: number
): Promise<HighFidelityDomPreparationResult> {
  const adapter = matchContentScopeAdapterForUrl(request.target.url);
  const selectors = adapter ?? genericContentScopeSelectors;
  const result = await raceWithHighFidelityTimeout(
    executeScriptInTab<HighFidelityDomPreparationResult | void, [HighFidelityDomPreparationAction]>(
      scripting,
      tabId,
      runHighFidelityDomPreparationAction,
      [{
        kind: 'prepare-high-fidelity-dom',
        request,
        adapter,
        selectors,
        genericSelectors: genericContentScopeSelectors
      }]
    ),
    timeoutMs
  );

  assertHighFidelityDomPreparationResult(result);
  return result;
}

export async function cleanupHighFidelityDomPreparation(
  tabId: number,
  scripting: HighFidelityScriptingLike,
  timeoutMs: number
): Promise<void> {
  await raceWithHighFidelityTimeout(
    executeScriptInTab<HighFidelityDomPreparationResult | void, [HighFidelityDomPreparationAction]>(
      scripting,
      tabId,
      runHighFidelityDomPreparationAction,
      [{ kind: 'cleanup-high-fidelity-dom' }],
      {
        allowUndefinedResult: true
      }
    ),
    timeoutMs
  );
}
