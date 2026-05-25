import {
  classifyExactExportUrlSupport,
  type ExactExportUnsupportedReason,
  type ExtensionTabLike,
  type ExtensionTabsLike
} from './exact-export-request';
import {
  executeScriptFilesInTab,
  isPermissionDeniedExtensionError,
  normalizeExtensionErrorMessage,
  type ExtensionScriptingLike
} from './extension-script-runtime';
import { errorRing } from './error-ring-buffer';

export type ActiveTabRuntimeFailureCode =
  | 'active-page-unavailable'
  | 'unsupported-page'
  | 'permission-denied'
  | 'runtime-unavailable';

export type ActiveTabSupportFailureCode = Exclude<ActiveTabRuntimeFailureCode, 'runtime-unavailable'>;

export interface ActiveTabRuntimeFailure {
  ok: false;
  code: ActiveTabRuntimeFailureCode;
  message: string;
  unsupportedReason?: ExactExportUnsupportedReason;
}

export interface ActiveTabSupportFailure {
  ok: false;
  code: ActiveTabSupportFailureCode;
  message: string;
  unsupportedReason?: ExactExportUnsupportedReason;
}

export interface ActiveTabRuntimeTabsLike extends ExtensionTabsLike {
  sendMessage(tabId: number, message: unknown): Promise<unknown>;
}

export type SupportedActiveTabResult =
  | { ok: true; tab: ExtensionTabLike & { id: number; url: string } }
  | ActiveTabSupportFailure;

export type ActiveTabRuntimeResult =
  | { ok: true; tab: ExtensionTabLike & { id: number; url: string } }
  | ActiveTabRuntimeFailure;

export interface ActiveTabRuntimeBootstrapOptions {
  pingMessage: unknown;
  runtimeScriptPath: string;
  activePageUnavailableMessage: string;
  unsupportedPageMessage: string;
  startFailureMessage: string;
  isReadyResponse?: (response: unknown) => boolean;
}

export function isMissingReceiverExtensionError(error: unknown): boolean {
  const message = normalizeExtensionErrorMessage(error).toLowerCase();
  return /receiving end does not exist|message port closed before a response was received|could not establish connection/.test(message);
}

export function isRuntimeFileLoadExtensionError(error: unknown): boolean {
  const message = normalizeExtensionErrorMessage(error).toLowerCase();
  return /could not load file|failed to load file|no such file|file not found/.test(message);
}

export async function querySupportedActiveTab(
  tabs: ExtensionTabsLike,
  options: Pick<ActiveTabRuntimeBootstrapOptions, 'activePageUnavailableMessage' | 'unsupportedPageMessage'>
): Promise<SupportedActiveTabResult> {
  try {
    const [activeTab] = await tabs.query({ active: true, currentWindow: true });

    if (!activeTab?.url || typeof activeTab.id !== 'number') {
      return {
        ok: false,
        code: 'active-page-unavailable',
        message: options.activePageUnavailableMessage
      };
    }

    const support = classifyExactExportUrlSupport(activeTab.url);

    if (!support.supported) {
      return {
        ok: false,
        code: 'unsupported-page',
        message: options.unsupportedPageMessage,
        unsupportedReason: support.reason
      };
    }

    return {
      ok: true,
      tab: {
        ...activeTab,
        id: activeTab.id,
        url: activeTab.url
      }
    };
  } catch (error) {
    return {
      ok: false,
      code: isPermissionDeniedExtensionError(error) ? 'permission-denied' : 'active-page-unavailable',
      message: normalizeExtensionErrorMessage(error) || options.activePageUnavailableMessage
    };
  }
}

export async function ensureActiveTabRuntime(
  tabs: ActiveTabRuntimeTabsLike,
  scripting: ExtensionScriptingLike,
  options: ActiveTabRuntimeBootstrapOptions
): Promise<ActiveTabRuntimeResult> {
  const activeTabResult = await querySupportedActiveTab(tabs, options);

  if (!activeTabResult.ok) {
    return activeTabResult;
  }

  let shouldInjectRuntime = false;

  try {
    const pingResponse = await tabs.sendMessage(activeTabResult.tab.id, options.pingMessage);
    shouldInjectRuntime = options.isReadyResponse
      ? !options.isReadyResponse(pingResponse)
      : false;
  } catch (error) {
    if (!isMissingReceiverExtensionError(error)) {
      return {
        ok: false,
        code: isPermissionDeniedExtensionError(error) ? 'permission-denied' : 'active-page-unavailable',
        message: normalizeExtensionErrorMessage(error) || options.startFailureMessage
      };
    }

    shouldInjectRuntime = true;
  }

  if (shouldInjectRuntime) {
    try {
      await executeScriptFilesInTab(scripting, activeTabResult.tab.id, [options.runtimeScriptPath]);
    } catch (injectionError) {
      errorRing.push({
        ts: Date.now(),
        kind: 'script_injection_failed',
        message: injectionError instanceof Error ? injectionError.message : String(injectionError),
        stackHead: injectionError instanceof Error ? injectionError.stack?.split('\n').slice(0, 3).join('\n') : undefined
      });

      const code = isPermissionDeniedExtensionError(injectionError)
        ? 'permission-denied'
        : isRuntimeFileLoadExtensionError(injectionError)
          ? 'runtime-unavailable'
          : 'active-page-unavailable';

      return {
        ok: false,
        code,
        message: normalizeExtensionErrorMessage(injectionError) || options.startFailureMessage
      };
    }
  }

  return activeTabResult;
}
