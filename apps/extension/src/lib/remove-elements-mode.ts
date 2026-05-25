import {
  type ExactExportUnsupportedReason,
  type ExtensionTabsLike
} from './exact-export-request';
import {
  isPermissionDeniedExtensionError,
  normalizeExtensionErrorMessage,
  type ExtensionScriptingLike
} from './extension-script-runtime';
import {
  ensureActiveTabRuntime,
  isMissingReceiverExtensionError,
  querySupportedActiveTab
} from './active-tab-runtime';

export type RemoveElementsModeFailureCode =
  | 'active-page-unavailable'
  | 'unsupported-page'
  | 'permission-denied'
  | 'runtime-unavailable';

export interface RemoveElementsModeTabsLike extends ExtensionTabsLike {
  sendMessage(tabId: number, message: RemoveElementsModeTabMessage): Promise<unknown>;
}

export interface RemoveElementsModeRuntimeLike {
  onMessage: {
    addListener(listener: RemoveElementsModeMessageListener): void;
  };
}

export type RemoveElementsModeSuccessStatus =
  | 'ready'
  | 'started'
  | 'already-active'
  | 'stopped';

export interface RemoveElementsModeSuccessResult {
  ok: true;
  status: RemoveElementsModeSuccessStatus;
  removedCount: number;
}

export interface RemoveElementsModeFailureResult {
  ok: false;
  code: RemoveElementsModeFailureCode;
  message: string;
  unsupportedReason?: ExactExportUnsupportedReason;
}

export type RemoveElementsModeStartResult =
  | RemoveElementsModeSuccessResult
  | RemoveElementsModeFailureResult;

export type RemoveElementsModeTabCommand =
  | 'ping'
  | 'start'
  | 'stop';

export interface RemoveElementsModeTabMessage {
  kind: 'pagemint.remove-elements-mode:v2';
  command: RemoveElementsModeTabCommand;
}

export type RemoveElementsModePageAction =
  | { kind: 'start' }
  | { kind: 'stop' };

type RemoveElementsModeMessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: RemoveElementsModeStartResult) => void
) => boolean | void;

interface RemoveElementsModeStore {
  active: boolean;
  highlightedElement: HTMLElement | null;
  removedElements: Array<{
    element: HTMLElement;
    hadStyleAttribute: boolean;
    previousInlineStyle: string | null;
  }>;
  styleElement: HTMLStyleElement | null;
  guideElement: HTMLDivElement | null;
  listeners?: {
    mouseover: (event: MouseEvent) => void;
    mouseout: (event: MouseEvent) => void;
    click: (event: MouseEvent) => void;
    contextmenu: (event: MouseEvent) => void;
    keydown: (event: KeyboardEvent) => void;
  };
}

const removeElementsModeMessageKind = 'pagemint.remove-elements-mode:v2';
const removeElementsRuntimeScriptPath = 'remove-elements-runtime.js';
const removeElementsGuideId = 'pagemint-remove-elements-guide';
const removeElementsStyleId = 'pagemint-remove-elements-style';
const removeElementsHighlightClass = 'pagemint-remove-elements-highlight';
const removeElementsModeFailureCodes = new Set<RemoveElementsModeFailureCode>([
  'active-page-unavailable',
  'unsupported-page',
  'permission-denied',
  'runtime-unavailable'
]);
const removeElementsModeSuccessStatuses = new Set<RemoveElementsModeSuccessResult['status']>([
  'ready',
  'started',
  'already-active',
  'stopped'
]);

interface RemoveElementsModeGlobal {
  browser?: {
    runtime?: RemoveElementsModeRuntimeLike;
  };
  chrome?: {
    runtime?: RemoveElementsModeRuntimeLike;
  };
  __pagemintRemoveElementsModeV2ListenerRegistered?: boolean;
}

function parseRemoveElementsModeStartResult(value: unknown): RemoveElementsModeStartResult | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<Record<string, unknown>>;

  if (
    candidate.ok === true
    && removeElementsModeSuccessStatuses.has(candidate.status as RemoveElementsModeSuccessResult['status'])
    && typeof candidate.removedCount === 'number'
    && Number.isFinite(candidate.removedCount)
    && candidate.removedCount >= 0
  ) {
    return {
      ok: true,
      status: candidate.status as RemoveElementsModeSuccessResult['status'],
      removedCount: candidate.removedCount
    };
  }

  if (
    candidate.ok === false
    && removeElementsModeFailureCodes.has(candidate.code as RemoveElementsModeFailureCode)
    && typeof candidate.message === 'string'
    && candidate.message.trim()
  ) {
    return {
      ok: false,
      code: candidate.code as RemoveElementsModeFailureCode,
      message: candidate.message,
      unsupportedReason: typeof candidate.unsupportedReason === 'string'
        ? candidate.unsupportedReason as ExactExportUnsupportedReason
        : undefined
    };
  }

  return null;
}

function createRemoveElementsModeTabMessage(command: RemoveElementsModeTabCommand): RemoveElementsModeTabMessage {
  return {
    kind: removeElementsModeMessageKind,
    command
  };
}

function isRemoveElementsModeTabMessage(value: unknown): value is RemoveElementsModeTabMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<RemoveElementsModeTabMessage>;
  return (
    candidate.kind === removeElementsModeMessageKind
    && typeof candidate.command === 'string'
    && ['ping', 'start', 'stop'].includes(candidate.command)
  );
}

function getRemoveElementsModeRuntime(): RemoveElementsModeRuntimeLike | null {
  const globalApi = globalThis as typeof globalThis & RemoveElementsModeGlobal;
  return globalApi.browser?.runtime ?? globalApi.chrome?.runtime ?? null;
}

function isRemoveElementsModeReadyResponse(value: unknown): boolean {
  const result = parseRemoveElementsModeStartResult(value);
  return result?.ok === true && result.status === 'ready';
}

export async function startRemoveElementsModeForActiveTab(
  tabs: RemoveElementsModeTabsLike,
  scripting: ExtensionScriptingLike
): Promise<RemoveElementsModeStartResult> {
  const startFailureMessage = 'PageMint could not start remove-elements mode on the active tab.';
  const activeTabResult = await ensureActiveTabRuntime(tabs, scripting, {
    pingMessage: createRemoveElementsModeTabMessage('ping'),
    runtimeScriptPath: removeElementsRuntimeScriptPath,
    activePageUnavailableMessage: 'Open PageMint from the tab you want to edit before export.',
    unsupportedPageMessage: 'Remove elements only works on active http and https pages.',
    startFailureMessage,
    isReadyResponse: isRemoveElementsModeReadyResponse
  });

  if (!activeTabResult.ok) {
    return activeTabResult;
  }

  try {
    const pageResult = await tabs.sendMessage(
      activeTabResult.tab.id,
      createRemoveElementsModeTabMessage('start')
    );

    return parseRemoveElementsModeStartResult(pageResult) ?? {
      ok: false,
      code: 'active-page-unavailable',
      message: startFailureMessage
    };
  } catch (error) {
    return {
      ok: false,
      code: isPermissionDeniedExtensionError(error) ? 'permission-denied' : 'active-page-unavailable',
      message: normalizeExtensionErrorMessage(error) || startFailureMessage
    };
  }
}

export async function stopRemoveElementsModeForActiveTab(
  tabs: RemoveElementsModeTabsLike
): Promise<RemoveElementsModeStartResult | null> {
  const stopFailureMessage = 'PageMint could not stop remove-elements mode on the active tab.';
  const activeTabResult = await querySupportedActiveTab(tabs, {
    activePageUnavailableMessage: 'Open PageMint from the tab you want to edit before export.',
    unsupportedPageMessage: 'Remove elements only works on active http and https pages.'
  });

  if (!activeTabResult.ok) {
    return activeTabResult;
  }

  try {
    const pageResult = await tabs.sendMessage(
      activeTabResult.tab.id,
      createRemoveElementsModeTabMessage('stop')
    );

    return parseRemoveElementsModeStartResult(pageResult);
  } catch (error) {
    if (isMissingReceiverExtensionError(error)) {
      return null;
    }

    return {
      ok: false,
      code: isPermissionDeniedExtensionError(error) ? 'permission-denied' : 'active-page-unavailable',
      message: normalizeExtensionErrorMessage(error) || stopFailureMessage
    };
  }
}

export function handleRemoveElementsModeTabMessage(message: unknown): RemoveElementsModeStartResult | null {
  if (!isRemoveElementsModeTabMessage(message)) {
    return null;
  }

  if (message.command === 'ping') {
    return {
      ok: true,
      status: 'ready',
      removedCount: 0
    };
  }

  return runRemoveElementsModePageAction({
    kind: message.command === 'stop' ? 'stop' : 'start'
  });
}

export function registerRemoveElementsModeTabMessageHandler(
  runtime: RemoveElementsModeRuntimeLike | null = getRemoveElementsModeRuntime()
): void {
  if (!runtime) {
    return;
  }

  const globalWithRegistration = globalThis as typeof globalThis & RemoveElementsModeGlobal;

  if (globalWithRegistration.__pagemintRemoveElementsModeV2ListenerRegistered === true) {
    return;
  }

  runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const response = handleRemoveElementsModeTabMessage(message);
    if (!response) {
      return undefined;
    }

    sendResponse(response);
    return true;
  });

  globalWithRegistration.__pagemintRemoveElementsModeV2ListenerRegistered = true;
}

export function runRemoveElementsModePageAction(
  action: RemoveElementsModePageAction
): RemoveElementsModeSuccessResult {
  const globalWithStore = globalThis as typeof globalThis & {
    __pagemintRemoveElementsMode?: RemoveElementsModeStore;
  };
  const documentLike = document;

  const getStore = (): RemoveElementsModeStore => {
    globalWithStore.__pagemintRemoveElementsMode ??= {
      active: false,
      highlightedElement: null,
      removedElements: [],
      styleElement: null,
      guideElement: null
    };

    return globalWithStore.__pagemintRemoveElementsMode;
  };

  const clearHighlightedElement = (store: RemoveElementsModeStore): void => {
    store.highlightedElement?.classList.remove(removeElementsHighlightClass);
    store.highlightedElement = null;
  };

  const restoreRemovedElement = (store: RemoveElementsModeStore): void => {
    const previous = store.removedElements.pop();
    if (!previous) {
      return;
    }

    if (!previous.hadStyleAttribute || previous.previousInlineStyle === null) {
      previous.element.removeAttribute('style');
      return;
    }

    previous.element.setAttribute('style', previous.previousInlineStyle);
  };

  const resolveTargetElement = (event: MouseEvent): HTMLElement | null => {
    const eventPath = typeof event.composedPath === 'function'
      ? event.composedPath()
      : [event.target];

    for (const candidate of eventPath) {
      if (!(candidate instanceof HTMLElement)) {
        continue;
      }

      if (
        candidate.id === removeElementsGuideId
        || candidate.closest(`#${removeElementsGuideId}`)
      ) {
        return null;
      }

      if (
        candidate === documentLike.documentElement
        || candidate === documentLike.body
        || candidate === documentLike.head
      ) {
        return null;
      }

      if (['HEAD', 'STYLE', 'SCRIPT', 'LINK', 'META', 'TITLE'].includes(candidate.tagName)) {
        return null;
      }

      return candidate;
    }

    return null;
  };

  const ensurePresentation = (store: RemoveElementsModeStore): void => {
    if (!store.styleElement) {
      const styleElement = documentLike.createElement('style');
      styleElement.id = removeElementsStyleId;
      styleElement.textContent = `
        .${removeElementsHighlightClass} {
          box-sizing: border-box !important;
          outline-offset: -2px !important;
          cursor: pointer !important;
          background-color: #f003 !important;
          outline: 2px dashed red !important;
        }

        #${removeElementsGuideId} {
          position: fixed !important;
          right: 16px !important;
          bottom: 16px !important;
          z-index: 2147483647 !important;
          max-width: min(320px, calc(100vw - 32px)) !important;
          padding: 10px 12px !important;
          border-radius: 12px !important;
          border: 1px solid rgba(0, 0, 0, 0.12) !important;
          background: rgba(22, 18, 15, 0.94) !important;
          color: #f7f1e3 !important;
          font: 500 12px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
          letter-spacing: 0 !important;
          box-shadow: 0 14px 30px rgba(0, 0, 0, 0.18) !important;
          pointer-events: none !important;
        }

        #${removeElementsGuideId} strong {
          color: #ffffff !important;
          font-weight: 700 !important;
        }
      `;
      (documentLike.head ?? documentLike.documentElement).appendChild(styleElement);
      store.styleElement = styleElement;
    }

    if (!store.guideElement) {
      const guideElement = documentLike.createElement('div');
      guideElement.id = removeElementsGuideId;
      guideElement.innerHTML = '<strong>Remove elements</strong><br>Click to hide. Ctrl/Cmd+Z undoes the last removal. Esc or right-click exits.';
      documentLike.body.appendChild(guideElement);
      store.guideElement = guideElement;
    }
  };

  const teardown = (store: RemoveElementsModeStore): RemoveElementsModeSuccessResult => {
    if (store.listeners) {
      documentLike.removeEventListener('mouseover', store.listeners.mouseover, true);
      documentLike.removeEventListener('mouseout', store.listeners.mouseout, true);
      documentLike.removeEventListener('click', store.listeners.click, true);
      documentLike.removeEventListener('contextmenu', store.listeners.contextmenu, true);
      documentLike.removeEventListener('keydown', store.listeners.keydown, true);
    }

    clearHighlightedElement(store);
    store.styleElement?.remove();
    store.guideElement?.remove();
    store.active = false;
    store.styleElement = null;
    store.guideElement = null;
    store.listeners = undefined;

    if (!store.removedElements.length) {
      globalWithStore.__pagemintRemoveElementsMode = undefined;
    }

    return {
      ok: true,
      status: 'stopped',
      removedCount: store.removedElements.length
    };
  };

  const start = (): RemoveElementsModeSuccessResult => {
    const store = getStore();

    if (store.active) {
      return {
        ok: true,
        status: 'already-active',
        removedCount: store.removedElements.length
      };
    }

    ensurePresentation(store);

    const listeners = {
      mouseover(event: MouseEvent): void {
        const target = resolveTargetElement(event);
        if (target === store.highlightedElement) {
          return;
        }

        clearHighlightedElement(store);
        if (!target) {
          return;
        }

        target.classList.add(removeElementsHighlightClass);
        store.highlightedElement = target;
      },
      mouseout(event: MouseEvent): void {
        const target = resolveTargetElement(event);
        if (!target || target !== store.highlightedElement) {
          return;
        }

        if (event.relatedTarget instanceof HTMLElement && target.contains(event.relatedTarget)) {
          return;
        }

        clearHighlightedElement(store);
      },
      click(event: MouseEvent): void {
        const target = resolveTargetElement(event);
        if (!target) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        clearHighlightedElement(store);
        store.removedElements.push({
          element: target,
          hadStyleAttribute: target.hasAttribute('style'),
          previousInlineStyle: target.getAttribute('style')
        });
        target.style.setProperty('display', 'none', 'important');
      },
      contextmenu(event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        teardown(store);
      },
      keydown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          teardown(store);
          return;
        }

        const normalizedKey = event.key.toLowerCase();
        const isUndo = normalizedKey === 'z' && (event.ctrlKey || event.metaKey) && !event.altKey;
        if (!isUndo) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        restoreRemovedElement(store);
      }
    };

    documentLike.addEventListener('mouseover', listeners.mouseover, true);
    documentLike.addEventListener('mouseout', listeners.mouseout, true);
    documentLike.addEventListener('click', listeners.click, true);
    documentLike.addEventListener('contextmenu', listeners.contextmenu, true);
    documentLike.addEventListener('keydown', listeners.keydown, true);
    store.listeners = listeners;
    store.active = true;

    return {
      ok: true,
      status: 'started',
      removedCount: store.removedElements.length
    };
  };

  return action.kind === 'stop'
    ? teardown(getStore())
    : start();
}
