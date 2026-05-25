import type {
  ExactExportTarget,
  SpecializedSurfaceAdapterId,
  SpecializedSurfaceSettingConstraint,
  SpecializedSurfaceSettingId
} from '@pagemint/shared-types';

export type SpecializedSurfaceFixtureId =
  | 'chatgpt-conversation'
  | 'gemini-conversation'
  | 'deepseek-conversation'
  | 'reddit-thread'
  | 'reddit-thread-no-comments'
  | 'pikabu-story';

export interface SpecializedSurfaceSettingExpectation {
  id: SpecializedSurfaceSettingId;
  defaultValue: boolean;
  constraint: SpecializedSurfaceSettingConstraint;
}

export interface SpecializedSurfaceFixtureDefinition {
  id: SpecializedSurfaceFixtureId;
  adapterId: SpecializedSurfaceAdapterId;
  label: string;
  description: string;
  target: ExactExportTarget;
  htmlFileName: string;
  expectedRootSelector: string;
  expectedRequiredSelectors: readonly string[];
  expectedCleanupSelectors: readonly string[];
  expectedPreservedSelectors: readonly string[];
  expectedSettings: readonly SpecializedSurfaceSettingExpectation[];
}

export type SpecializedSurfaceRouteFixtureId =
  | 'gemini-app-root-supported'
  | 'gemini-unsupported-sibling'
  | 'deepseek-login-unsupported'
  | 'reddit-subreddit-home-unsupported'
  | 'reddit-wiki-unsupported'
  | 'reddit-trailing-slash-thread-supported';

export interface SpecializedSurfaceRouteFixtureDefinition {
  id: SpecializedSurfaceRouteFixtureId;
  label: string;
  url: string;
  expectedAdapterId: SpecializedSurfaceAdapterId | null;
  htmlFixtureId?: SpecializedSurfaceFixtureId;
}

const chatConversationSettings = [
  { id: 'preserveAuthorLabels', defaultValue: true, constraint: 'always-on' },
  { id: 'preserveCodeBlocks', defaultValue: true, constraint: 'always-on' },
  { id: 'expandCollapsedContent', defaultValue: true, constraint: 'user-configurable' }
] as const satisfies readonly SpecializedSurfaceSettingExpectation[];

const communityThreadSettings = [
  { id: 'preserveAuthorLabels', defaultValue: true, constraint: 'always-on' },
  { id: 'preserveTimestamps', defaultValue: true, constraint: 'user-configurable' },
  { id: 'preserveEngagement', defaultValue: true, constraint: 'user-configurable' },
  { id: 'preserveCodeBlocks', defaultValue: true, constraint: 'always-on' },
  { id: 'expandCollapsedContent', defaultValue: true, constraint: 'user-configurable' }
] as const satisfies readonly SpecializedSurfaceSettingExpectation[];

export const specializedSurfaceFixtureManifest = [
  {
    id: 'chatgpt-conversation',
    adapterId: 'chatgpt-conversation',
    label: 'ChatGPT conversation',
    description: 'Conversation turns, sidebar cleanup, and code preservation stay deterministic.',
    target: {
      url: 'https://chatgpt.com/c/conversation-123',
      title: 'ChatGPT conversation'
    },
    htmlFileName: 'chatgpt-conversation.html',
    expectedRootSelector: '[data-testid="conversation-turns"]',
    expectedRequiredSelectors: ['[data-testid="conversation-turns"]', '[data-message-author-role]'],
    expectedCleanupSelectors: ['nav', 'aside', 'form[data-testid="composer"]', '[data-testid="sidebar"]'],
    expectedPreservedSelectors: ['[data-message-author-role]', '[data-testid="conversation-turn"]', 'pre code', 'ol', 'ul'],
    expectedSettings: chatConversationSettings
  },
  {
    id: 'gemini-conversation',
    adapterId: 'gemini-conversation',
    label: 'Gemini conversation',
    description: 'Gemini keeps turn structure and message content while excluding prompt chrome.',
    target: {
      url: 'https://gemini.google.com/app',
      title: 'Gemini conversation'
    },
    htmlFileName: 'gemini-conversation.html',
    expectedRootSelector: '[data-testid="conversation-root"]',
    expectedRequiredSelectors: ['[data-testid="conversation-root"]', '[data-turn-role]'],
    expectedCleanupSelectors: ['nav', 'aside', 'form[aria-label*="prompt" i]', '[data-testid="app-bar"]'],
    expectedPreservedSelectors: ['[data-turn-role]', '[data-testid="message-content"]', 'pre code', 'ol', 'ul'],
    expectedSettings: chatConversationSettings
  },
  {
    id: 'deepseek-conversation',
    adapterId: 'deepseek-conversation',
    label: 'DeepSeek conversation',
    description: 'DeepSeek conversation history stays captureable without matching login or shell routes.',
    target: {
      url: 'https://chat.deepseek.com/a/chat/s/thread-42',
      title: 'DeepSeek conversation'
    },
    htmlFileName: 'deepseek-conversation.html',
    expectedRootSelector: '[data-testid="chat-history"]',
    expectedRequiredSelectors: ['[data-testid="chat-history"]', '[data-role="user"], [data-role="assistant"]'],
    expectedCleanupSelectors: ['nav', 'aside', 'form', '[data-testid="chat-sidebar"]'],
    expectedPreservedSelectors: ['[data-role="user"], [data-role="assistant"]', '[data-testid="message-content"]', 'pre code', 'ol', 'ul'],
    expectedSettings: chatConversationSettings
  },
  {
    id: 'reddit-thread',
    adapterId: 'reddit-thread',
    label: 'Reddit thread',
    description: 'Thread post plus comments stay preserved while right-rail chrome is excluded.',
    target: {
      url: 'https://www.reddit.com/r/typescript/comments/abc123/page_export_contract/',
      title: 'Reddit thread'
    },
    htmlFileName: 'reddit-thread.html',
    expectedRootSelector: 'main shreddit-post',
    expectedRequiredSelectors: ['shreddit-post, [data-testid="post-container"]'],
    expectedCleanupSelectors: ['header', 'nav', 'aside', '[data-testid="right-sidebar"]', 'shreddit-comments-page-ad'],
    expectedPreservedSelectors: ['shreddit-post, [data-testid="post-container"]', '[data-testid="comment"], shreddit-comment', '[data-click-id="body"]', 'pre code'],
    expectedSettings: communityThreadSettings
  },
  {
    id: 'reddit-thread-no-comments',
    adapterId: 'reddit-thread',
    label: 'Reddit thread without comments',
    description: 'A valid Reddit post root with zero comments should still detect as supported.',
    target: {
      url: 'https://www.reddit.com/r/typescript/comments/abc123/',
      title: 'Reddit thread without comments'
    },
    htmlFileName: 'reddit-thread-no-comments.html',
    expectedRootSelector: 'main shreddit-post',
    expectedRequiredSelectors: ['shreddit-post, [data-testid="post-container"]'],
    expectedCleanupSelectors: ['header', 'nav', 'aside', '[data-testid="right-sidebar"]', 'shreddit-comments-page-ad'],
    expectedPreservedSelectors: ['shreddit-post, [data-testid="post-container"]', '[data-testid="comment"], shreddit-comment', '[data-click-id="body"]', 'pre code'],
    expectedSettings: communityThreadSettings
  },
  {
    id: 'pikabu-story',
    adapterId: 'pikabu-story',
    label: 'Pikabu story',
    description: 'Story title, body, and reaction metadata stay preserved while footer chrome is excluded.',
    target: {
      url: 'https://pikabu.ru/story/export_contract_demo_424242',
      title: 'Pikabu story'
    },
    htmlFileName: 'pikabu-story.html',
    expectedRootSelector: 'main article.story',
    expectedRequiredSelectors: ['article.story, [data-testid="story-page"]', '.story__content, [data-testid="story-content"]'],
    expectedCleanupSelectors: ['header', 'nav', 'aside', '.story__footer', '[data-testid="story-comments-toggle"]'],
    expectedPreservedSelectors: ['.story__title, [data-testid="story-title"]', '.story__content, [data-testid="story-content"]', '[data-testid="story-reaction-bar"]', 'pre code'],
    expectedSettings: communityThreadSettings
  }
] as const satisfies readonly SpecializedSurfaceFixtureDefinition[];

export const specializedSurfaceRouteFixtures = [
  {
    id: 'gemini-app-root-supported',
    label: 'Gemini exact /app route stays supported',
    url: 'https://gemini.google.com/app',
    expectedAdapterId: 'gemini-conversation',
    htmlFixtureId: 'gemini-conversation'
  },
  {
    id: 'gemini-unsupported-sibling',
    label: 'Gemini sibling path stays unsupported',
    url: 'https://gemini.google.com/apple',
    expectedAdapterId: null
  },
  {
    id: 'deepseek-login-unsupported',
    label: 'DeepSeek login shell stays unsupported',
    url: 'https://chat.deepseek.com/login',
    expectedAdapterId: null
  },
  {
    id: 'reddit-subreddit-home-unsupported',
    label: 'Reddit subreddit home stays unsupported',
    url: 'https://www.reddit.com/r/typescript/',
    expectedAdapterId: null
  },
  {
    id: 'reddit-wiki-unsupported',
    label: 'Reddit wiki pages stay unsupported',
    url: 'https://www.reddit.com/r/typescript/wiki/index',
    expectedAdapterId: null
  },
  {
    id: 'reddit-trailing-slash-thread-supported',
    label: 'Reddit thread route without a slug stays supported',
    url: 'https://www.reddit.com/r/typescript/comments/abc123/',
    expectedAdapterId: 'reddit-thread',
    htmlFixtureId: 'reddit-thread-no-comments'
  }
] as const satisfies readonly SpecializedSurfaceRouteFixtureDefinition[];
