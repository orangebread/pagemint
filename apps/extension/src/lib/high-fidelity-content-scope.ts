import type {
  ExactExportContentScopeFallbackReason,
  ExactExportContentScopeSupplementStatuses
} from '@pagemint/shared-types';

export interface SerializableContentScopeAdapter {
  id: string;
  version: string;
  hostnameSuffixes: readonly string[];
  rootSelectors: readonly string[];
  commentSelectors: readonly string[];
  recommendationSelectors: readonly string[];
  footerSelectors: readonly string[];
  stopSelectors: readonly string[];
}

export interface SerializableContentScopeSelectorSet {
  rootSelectors: readonly string[];
  commentSelectors: readonly string[];
  recommendationSelectors: readonly string[];
  footerSelectors: readonly string[];
  stopSelectors: readonly string[];
}

export const genericContentScopeSelectors: SerializableContentScopeSelectorSet = {
  rootSelectors: [
    'main article',
    '[role="main"] article',
    'article',
    'main',
    '[role="main"]'
  ],
  commentSelectors: [
    '#comments',
    '[id*="comment" i]',
    '[class*="comment" i]',
    'section[aria-label*="comment" i]',
    'section[aria-labelledby*="comment" i]'
  ],
  recommendationSelectors: [
    '#recommendations',
    '[id*="recommend" i]',
    '[class*="recommend" i]',
    '[class*="related" i]',
    'section[aria-label*="related" i]'
  ],
  footerSelectors: [
    'footer',
    '[role="contentinfo"]',
    '[class*="footer" i]'
  ],
  stopSelectors: [
    '#comments',
    '#recommendations',
    'footer',
    '[role="contentinfo"]'
  ]
};

export const substackContentScopeAdapter: SerializableContentScopeAdapter = {
  id: 'substack-article',
  version: '1',
  hostnameSuffixes: ['substack.com'],
  rootSelectors: [
    '[data-post-id] article',
    'main article',
    'article',
    '.available-content',
    '[data-testid="post-content"]'
  ],
  commentSelectors: [
    '#comments',
    '[data-comments-root]',
    '[data-testid="discussion"]',
    '.post-comments',
    'section[aria-label*="discussion" i]'
  ],
  recommendationSelectors: [
    '#recommendations',
    '[data-recommendations-root]',
    '.related-posts',
    '.recommended-posts',
    'section[aria-label*="recommend" i]'
  ],
  footerSelectors: [
    'footer',
    '[data-footer-root]',
    '[role="contentinfo"]'
  ],
  stopSelectors: [
    '#comments',
    '#recommendations',
    'footer',
    '[role="contentinfo"]'
  ]
};

export const contentScopeAdapterRegistry = [
  substackContentScopeAdapter
] as const satisfies readonly SerializableContentScopeAdapter[];

export function matchContentScopeAdapterForUrl(url: string): SerializableContentScopeAdapter | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return contentScopeAdapterRegistry.find((adapter) => (
      adapter.hostnameSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))
    )) ?? null;
  } catch {
    return null;
  }
}

export function getContentScopeSelectorsForUrl(url: string): SerializableContentScopeSelectorSet {
  const adapter = matchContentScopeAdapterForUrl(url);

  if (!adapter) {
    return genericContentScopeSelectors;
  }

  return {
    rootSelectors: adapter.rootSelectors,
    commentSelectors: adapter.commentSelectors,
    recommendationSelectors: adapter.recommendationSelectors,
    footerSelectors: adapter.footerSelectors,
    stopSelectors: adapter.stopSelectors
  };
}

export function createDefaultScopedSupplementStatuses(options: {
  includeComments: boolean;
  includeRecommendations: boolean;
  includeFooter: boolean;
}): ExactExportContentScopeSupplementStatuses {
  return {
    comments: options.includeComments ? 'not-found' : 'omitted',
    recommendations: options.includeRecommendations ? 'not-found' : 'omitted',
    footer: options.includeFooter ? 'not-found' : 'omitted'
  };
}

export function inferFallbackReasonFromRootState(options: {
  hadCandidate: boolean;
  hadSelectorMatch: boolean;
  rootTextLength: number;
  rootAreaPx: number;
}): ExactExportContentScopeFallbackReason {
  if (!options.hadSelectorMatch) {
    return 'root-selector-empty';
  }

  if (!options.hadCandidate) {
    return 'adapter-miss';
  }

  if (options.rootTextLength < 500 || options.rootAreaPx < 120_000) {
    return 'root-too-small';
  }

  return 'low-confidence-root';
}
