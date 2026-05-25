import {
  buildElementSelectionRequest,
  buildExactExportRequest,
  buildRegionSelectionRequest,
  createExactExportSuggestedFileName,
  createManagedPdfAssetOutcome,
  createSelectionConfirmedResult,
  createSelectionInvalidBoundaryResult,
  createSelectionRenderFailedResult,
  createSelectionUnsupportedSurfaceResult,
  validateSelectionBoundary
} from '@pagemint/render-core';
import type {
  ElementSelectionBoundary,
  ExactExportConfig,
  ExactExportRequest,
  ManagedPdfAssetOutcome,
  RegionSelectionBoundary,
  SelectionRect,
  SelectionRequest,
  SelectionResult
} from '@pagemint/shared-types';

import type {
  ExactExportStageRunResponse,
  ExactExportStagedSessionRegistry,
  ExtensionRuntimeWithMessagingLike as ExactExportStagedRuntimeWithMessagingLike,
  ManagedPdfStagedSessionSummary,
  ManagedStagedDeliveryPreference
} from './exact-export-staged-session';
import {
  isPermissionDeniedExtensionError,
  normalizeExtensionErrorMessage,
  type ExtensionScriptingLike
} from './extension-script-runtime';
import {
  type ExactExportUnsupportedReason,
  type ExtensionTabLike,
  type ExtensionTabsLike
} from './exact-export-request';
import {
  ensureActiveTabRuntime,
  isMissingReceiverExtensionError,
  querySupportedActiveTab
} from './active-tab-runtime';
import {
  renderSelectionCaptureToPdfBase64,
  type SelectionModeViewportSnapshot
} from './selection-mode-capture';
import {
  loadSelectionModeCoachSeen,
  markSelectionModeCoachSeen
} from './selection-mode-coach';
import { errorRing } from './error-ring-buffer';

export type SelectionModeFailureCode =
  | 'active-page-unavailable'
  | 'unsupported-page'
  | 'permission-denied'
  | 'runtime-unavailable';

export type SelectionModeSuccessStatus =
  | 'ready'
  | 'started'
  | 'already-active'
  | 'stopped';

export interface SelectionModeSuccessResult {
  ok: true;
  status: SelectionModeSuccessStatus;
  message: string;
}

export interface SelectionModeFailureResult {
  ok: false;
  code: SelectionModeFailureCode;
  message: string;
  unsupportedReason?: ExactExportUnsupportedReason;
}

export type SelectionModeStartResult =
  | SelectionModeSuccessResult
  | SelectionModeFailureResult;

export interface SelectionModeStartOptions {
  config: ExactExportConfig;
  preferredManagedDelivery: ManagedStagedDeliveryPreference;
  highFidelityModePreferenceEnabled: boolean;
}

export interface SelectionModeRuntimeOptions {
  pageRequest: ExactExportRequest;
  preferredManagedDelivery: ManagedStagedDeliveryPreference;
  highFidelityModePreferenceEnabled: boolean;
}

export type SelectionModeTabCommand =
  | 'ping'
  | 'start'
  | 'stop';

export interface SelectionModeTabMessage {
  kind: 'pagemint.selection-mode';
  command: SelectionModeTabCommand;
  options?: SelectionModeRuntimeOptions;
}

export interface SelectionModeCaptureAndStageMessage {
  kind: 'selection-mode.capture-and-stage';
  request: SelectionRequest;
  pageRequest: ExactExportRequest;
  viewport: SelectionModeViewportSnapshot;
  preferredManagedDelivery: ManagedStagedDeliveryPreference;
}

export interface SelectionModeCaptureAndStageSuccessResponse {
  ok: true;
  result: SelectionResult;
  session?: ManagedPdfStagedSessionSummary;
}

export interface SelectionModeCaptureAndStageFailureResponse {
  ok: false;
  message: string;
}

export type SelectionModeCaptureAndStageResponse =
  | SelectionModeCaptureAndStageSuccessResponse
  | SelectionModeCaptureAndStageFailureResponse;

export interface SelectionModeTabsLike extends ExtensionTabsLike {
  sendMessage(tabId: number, message: SelectionModeTabMessage): Promise<unknown>;
}

export interface SelectionModeCaptureTabsLike extends ExtensionTabsLike {
  captureVisibleTab(
    windowId?: number,
    options?: {
      format?: 'jpeg' | 'png';
      quality?: number;
    }
  ): Promise<string>;
}

export interface SelectionModeRuntimeLike {
  sendMessage?(message: unknown): Promise<unknown>;
  onMessage?: {
    addListener(listener: SelectionModeMessageListener): void;
  };
}

interface SelectionModeBackgroundRuntimeLike extends ExactExportStagedRuntimeWithMessagingLike {}

interface SelectionModeMessageSenderLike {
  tab?: ExtensionTabLike & {
    windowId?: number;
  };
}

type SelectionModeMessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: SelectionModeStartResult) => void
) => boolean | void;

interface SelectionModeSelectionCandidate {
  request: SelectionRequest;
  viewport: SelectionModeViewportSnapshot;
  label: string;
}

interface SelectionModeHoverPreview {
  rect: DOMRect;
  label: string;
}

type SelectionModePhase =
  | 'choosing'
  | 'selected'
  | 'submitting'
  | 'error'
  | 'completed'
  | 'saving'
  | 'saved'
  | 'save-error';

interface SelectionModeStore {
  active: boolean;
  currentMode: 'element' | 'region';
  phase: SelectionModePhase;
  suppressNextClick: boolean;
  lastErrorOutcome:
    | 'invalid-boundary'
    | 'render-failed'
    | 'unsupported-surface'
    | 'cancelled'
    | 'session-not-found'
    | 'permission-denied'
    | 'download-failed'
    | 'save-timeout'
    | null;
  options: SelectionModeRuntimeOptions | null;
  selectedCandidate: SelectionModeSelectionCandidate | null;
  hoverPreview: SelectionModeHoverPreview | null;
  dragAnchor: { x: number; y: number } | null;
  dragFocus: { x: number; y: number } | null;
  message: string;
  detail: string;
  overflowMenuOpen: boolean;
  coachVisible: boolean;
  coachInteractionSeen: boolean;
  coachElement: HTMLDivElement | null;
  coachTimeoutHandle: ReturnType<typeof setTimeout> | null;
  saveTimeoutHandle: ReturnType<typeof setTimeout> | null;
  styleElement: HTMLStyleElement | null;
  rootElement: HTMLDivElement | null;
  panelElement: HTMLDivElement | null;
  selectionBoxElement: HTMLDivElement | null;
  regionBoxElement: HTMLDivElement | null;
  dimChipElement: HTMLDivElement | null;
  stagedSessionId: string | null;
  stagedDeliveryClass: 'managed-pdf-asset' | 'browser-print-handoff' | null;
  listeners?: {
    mousemove: (event: MouseEvent) => void;
    click: (event: MouseEvent) => void;
    pointerdown: (event: PointerEvent) => void;
    pointermove: (event: PointerEvent) => void;
    pointerup: (event: PointerEvent) => void;
    contextmenu: (event: MouseEvent) => void;
    keydown: (event: KeyboardEvent) => void;
    wheel: (event: WheelEvent) => void;
  };
}

interface SelectionModeGlobal {
  browser?: {
    runtime?: SelectionModeRuntimeLike;
  };
  chrome?: {
    runtime?: SelectionModeRuntimeLike;
  };
  __pagemintSelectionModeListenerRegistered?: boolean;
  __pagemintSelectionMode?: SelectionModeStore;
}

interface SelectionModeBackgroundDependencies {
  renderSelectionCapture?: typeof renderSelectionCaptureToPdfBase64;
}

const selectionModeMessageKind = 'pagemint.selection-mode';
const selectionModeRuntimeScriptPath = 'selection-mode-runtime.js';
const selectionModeRootId = 'pagemint-selection-mode-root';
const selectionModeStyleId = 'pagemint-selection-mode-style';
const selectionModePanelId = 'pagemint-selection-mode-panel';
const selectionModeSuccessStatuses = new Set<SelectionModeSuccessStatus>([
  'ready',
  'started',
  'already-active',
  'stopped'
]);
const selectionModeFailureCodes = new Set<SelectionModeFailureCode>([
  'active-page-unavailable',
  'unsupported-page',
  'permission-denied',
  'runtime-unavailable'
]);
const minimumSelectionDimension = 8;
const dragIntentThresholdPx = 4;
const defaultSelectionChoosingMessage = 'Hover or drag to start.';
const defaultSelectionChoosingDetail = '';
const drawingRegionMessage = 'Drawing region…';
const submittingSelectionMessage = 'Staging managed PDF…';
const submittingWholePageMessage = 'Capturing whole page…';
const completedSelectionMessage = 'Staged in PageMint.';
const completedSelectionDetail = 'Reopen popup to save.';
const savingSelectionMessage = 'Saving PDF…';
const savedSelectionPrefix = 'Saved';
const errorSaveFailedTitle = 'Couldn’t save that PDF.';
const errorSelectionExpiredTitle = 'This selection expired.';
const errorSelectionExpiredDetail = 'PageMint had to release the staged PDF. Capture again.';
const savingTimeoutTitle = 'Lost track of save.';
const savingTimeoutDetail = 'Check your downloads folder. PageMint can’t confirm whether this completed.';
const completedWholePageManagedMessage = 'Whole page staged. Reopen popup to save.';
const completedWholePagePrintMessage = 'Whole page ready. Reopen popup to print.';
const errorInvalidBoundaryTitle = 'Couldn’t capture that boundary.';
const errorRenderFailedTitle = 'Couldn’t capture that boundary.';
const errorUnsupportedSurfaceTitle = 'This page won’t allow precise selection.';
const errorSelectionGenericMessage = 'Selection didn’t capture.';

function getSelectionModeRuntime(): SelectionModeRuntimeLike | null {
  const extensionApi = globalThis as typeof globalThis & SelectionModeGlobal;
  return extensionApi.browser?.runtime ?? extensionApi.chrome?.runtime ?? null;
}

function isSelectionModeUiNode(candidate: EventTarget | null | undefined): boolean {
  return candidate instanceof Element && Boolean(candidate.closest(`#${selectionModeRootId}`));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseSelectionModeStartResult(value: unknown): SelectionModeStartResult | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<Record<string, unknown>>;

  if (
    candidate.ok === true
    && selectionModeSuccessStatuses.has(candidate.status as SelectionModeSuccessStatus)
    && typeof candidate.message === 'string'
  ) {
    return {
      ok: true,
      status: candidate.status as SelectionModeSuccessStatus,
      message: candidate.message
    };
  }

  if (
    candidate.ok === false
    && selectionModeFailureCodes.has(candidate.code as SelectionModeFailureCode)
    && typeof candidate.message === 'string'
  ) {
    return {
      ok: false,
      code: candidate.code as SelectionModeFailureCode,
      message: candidate.message,
      unsupportedReason: typeof candidate.unsupportedReason === 'string'
        ? candidate.unsupportedReason as ExactExportUnsupportedReason
        : undefined
    };
  }

  return null;
}

function createSelectionModeTabMessage(
  command: SelectionModeTabCommand,
  options?: SelectionModeRuntimeOptions
): SelectionModeTabMessage {
  return {
    kind: selectionModeMessageKind,
    command,
    ...(options ? { options } : {})
  };
}

function isSelectionModeTabMessage(value: unknown): value is SelectionModeTabMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SelectionModeTabMessage>;
  return (
    candidate.kind === selectionModeMessageKind
    && typeof candidate.command === 'string'
    && ['ping', 'start', 'stop'].includes(candidate.command)
  );
}

function isSelectionModeCaptureAndStageMessage(value: unknown): value is SelectionModeCaptureAndStageMessage {
  return Boolean(value)
    && typeof value === 'object'
    && (value as SelectionModeCaptureAndStageMessage).kind === 'selection-mode.capture-and-stage';
}

function isSelectionModeReadyResponse(value: unknown): boolean {
  const result = parseSelectionModeStartResult(value);
  return result?.ok === true && result.status === 'ready';
}

function buildSelectionModeRuntimeOptions(
  tab: ExtensionTabLike & { url: string },
  options: SelectionModeStartOptions
): SelectionModeRuntimeOptions {
  return {
    pageRequest: buildExactExportRequest(
      {
        url: tab.url,
        title: tab.title?.trim() || 'Untitled page'
      },
      {
        ...options.config,
        contentScope: {
          ...options.config.contentScope,
          mode: 'full-page'
        }
      }
    ),
    preferredManagedDelivery: options.preferredManagedDelivery,
    highFidelityModePreferenceEnabled: options.highFidelityModePreferenceEnabled
  };
}

export async function startSelectionModeForActiveTab(
  tabs: SelectionModeTabsLike,
  scripting: ExtensionScriptingLike,
  options: SelectionModeStartOptions
): Promise<SelectionModeStartResult> {
  const startFailureMessage = 'PageMint could not start selection mode on the active tab.';
  const activeTabResult = await ensureActiveTabRuntime(tabs, scripting, {
    pingMessage: createSelectionModeTabMessage('ping'),
    runtimeScriptPath: selectionModeRuntimeScriptPath,
    activePageUnavailableMessage: 'Open PageMint from the tab you want to select before export.',
    unsupportedPageMessage: 'Selection mode only works on active http and https pages.',
    startFailureMessage,
    isReadyResponse: isSelectionModeReadyResponse
  });

  if (!activeTabResult.ok) {
    return activeTabResult;
  }

  try {
    const pageResult = await tabs.sendMessage(
      activeTabResult.tab.id,
      createSelectionModeTabMessage(
        'start',
        buildSelectionModeRuntimeOptions(activeTabResult.tab, options)
      )
    );

    return parseSelectionModeStartResult(pageResult) ?? {
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

export async function stopSelectionModeForActiveTab(
  tabs: SelectionModeTabsLike
): Promise<SelectionModeStartResult | null> {
  const stopFailureMessage = 'PageMint could not stop selection mode on the active tab.';
  const activeTabResult = await querySupportedActiveTab(tabs, {
    activePageUnavailableMessage: 'Open PageMint from the tab you want to edit before export.',
    unsupportedPageMessage: 'Selection mode only works on active http and https pages.'
  });

  if (!activeTabResult.ok) {
    return activeTabResult;
  }

  try {
    const pageResult = await tabs.sendMessage(
      activeTabResult.tab.id,
      createSelectionModeTabMessage('stop')
    );

    return parseSelectionModeStartResult(pageResult);
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

function getSelectionModeStore(): SelectionModeStore {
  const globalWithStore = globalThis as typeof globalThis & SelectionModeGlobal;
  globalWithStore.__pagemintSelectionMode ??= {
    active: false,
    currentMode: 'element',
    phase: 'choosing',
    suppressNextClick: false,
    lastErrorOutcome: null,
    options: null,
    selectedCandidate: null,
    hoverPreview: null,
    dragAnchor: null,
    dragFocus: null,
    message: defaultSelectionChoosingMessage,
    detail: defaultSelectionChoosingDetail,
    overflowMenuOpen: false,
    coachVisible: false,
    coachInteractionSeen: false,
    coachElement: null,
    coachTimeoutHandle: null,
    saveTimeoutHandle: null,
    styleElement: null,
    rootElement: null,
    panelElement: null,
    selectionBoxElement: null,
    regionBoxElement: null,
    dimChipElement: null,
    stagedSessionId: null,
    stagedDeliveryClass: null
  };

  return globalWithStore.__pagemintSelectionMode;
}

function getSelectionModePageBounds(documentLike: Document): SelectionRect {
  const documentElement = documentLike.documentElement;
  const body = documentLike.body;

  return {
    x: 0,
    y: 0,
    width: Math.max(documentElement?.scrollWidth ?? 0, body?.scrollWidth ?? 0, globalThis.innerWidth),
    height: Math.max(documentElement?.scrollHeight ?? 0, body?.scrollHeight ?? 0, globalThis.innerHeight)
  };
}

function createViewportSnapshot(): SelectionModeViewportSnapshot {
  return {
    scrollX: globalThis.scrollX,
    scrollY: globalThis.scrollY,
    innerWidth: globalThis.innerWidth,
    innerHeight: globalThis.innerHeight,
    devicePixelRatio: globalThis.devicePixelRatio || 1
  };
}

function toViewportRect(bounds: SelectionRect): SelectionRect {
  return {
    x: bounds.x - globalThis.scrollX,
    y: bounds.y - globalThis.scrollY,
    width: bounds.width,
    height: bounds.height
  };
}

function applyOverlayRect(
  element: HTMLDivElement | null,
  bounds: SelectionRect | null,
  visible: boolean,
  options: {
    toneClass: 'element' | 'region';
    dashed?: boolean;
  } = {
    toneClass: 'element'
  }
): void {
  if (!element) {
    return;
  }

  element.className = `pagemint-selection-mode__box pagemint-selection-mode__box--${options.toneClass}${options.dashed ? ' pagemint-selection-mode__box--dashed' : ''}`;

  if (!visible || !bounds) {
    element.style.display = 'none';
    return;
  }

  element.style.display = 'block';
  element.style.left = `${bounds.x}px`;
  element.style.top = `${bounds.y}px`;
  element.style.width = `${Math.max(1, bounds.width)}px`;
  element.style.height = `${Math.max(1, bounds.height)}px`;
}

function setSelectionModeStatus(
  store: SelectionModeStore,
  phase: SelectionModePhase,
  message: string,
  detail: string,
  options?: {
    selectedCandidate?: SelectionModeSelectionCandidate | null;
    hoverPreview?: SelectionModeHoverPreview | null;
  }
): void {
  store.phase = phase;
  store.message = message;
  store.detail = detail;
  if (typeof options?.selectedCandidate !== 'undefined') {
    store.selectedCandidate = options.selectedCandidate;
  }
  if (typeof options?.hoverPreview !== 'undefined') {
    store.hoverPreview = options.hoverPreview;
  }
  renderSelectionModeUi(store);
}

function setSelectionModeChromeHidden(store: SelectionModeStore, hidden: boolean): void {
  if (!store.rootElement) {
    return;
  }

  store.rootElement.style.visibility = hidden ? 'hidden' : '';
}

function clearDragSelection(store: SelectionModeStore): void {
  store.dragAnchor = null;
  store.dragFocus = null;
}

function resetSelectionChoice(store: SelectionModeStore): void {
  store.selectedCandidate = null;
  store.hoverPreview = null;
  store.lastErrorOutcome = null;
  clearDragSelection(store);
  setSelectionModeStatus(
    store,
    'choosing',
    defaultSelectionChoosingMessage,
    defaultSelectionChoosingDetail,
    {
      selectedCandidate: null,
      hoverPreview: null
    }
  );
}

function validateSelectionRequest(request: SelectionRequest) {
  return request.kind === 'element-selection.request'
    ? validateSelectionBoundary(request)
    : validateSelectionBoundary(request);
}

function createSelectionValidationFailureResult(
  request: SelectionRequest,
  validation: ReturnType<typeof validateSelectionRequest>
): SelectionResult {
  if (validation.ok) {
    throw new Error('PageMint expected a failed selection validation result.');
  }

  if (validation.outcome === 'unsupported-surface') {
    return request.kind === 'element-selection.request'
      ? createSelectionUnsupportedSurfaceResult(
          request,
          validation.failure.reason === 'unsupported-page' ? validation.failure.reason : 'unsupported-page',
          validation.failure.message
        )
      : createSelectionUnsupportedSurfaceResult(
          request,
          validation.failure.reason === 'unsupported-page' ? validation.failure.reason : 'unsupported-page',
          validation.failure.message
        );
  }

  const reason = validation.failure.reason === 'unsupported-page'
    ? undefined
    : validation.failure.reason;

  return request.kind === 'element-selection.request'
    ? createSelectionInvalidBoundaryResult(request, reason, validation.failure.message)
    : createSelectionInvalidBoundaryResult(request, reason, validation.failure.message);
}

function createSelectionRenderFailedOutcome(request: SelectionRequest, message: string): SelectionResult {
  return request.kind === 'element-selection.request'
    ? createSelectionRenderFailedResult(request, message)
    : createSelectionRenderFailedResult(request, message);
}

function createSelectionConfirmedOutcome(
  request: SelectionRequest,
  managedAsset: ManagedPdfAssetOutcome
): SelectionResult {
  return request.kind === 'element-selection.request'
    ? createSelectionConfirmedResult(request, managedAsset)
    : createSelectionConfirmedResult(request, managedAsset);
}

function describeSelectionResult(result: SelectionResult): { message: string; detail: string } {
  switch (result.outcome) {
    case 'invalid-boundary':
      return {
        message: errorInvalidBoundaryTitle,
        detail: result.failure.message
      };
    case 'unsupported-surface':
      return {
        message: errorUnsupportedSurfaceTitle,
        detail: result.failure.message
      };
    case 'render-failed':
      return {
        message: errorRenderFailedTitle,
        detail: result.failure.message
      };
    case 'cancelled':
      return {
        message: errorSelectionGenericMessage,
        detail: result.message
      };
    case 'confirmed':
      return {
        message: completedSelectionMessage,
        detail: completedSelectionDetail
      };
    default:
      return {
        message: errorSelectionGenericMessage,
        detail: 'Retry, or capture the whole page instead.'
      };
  }
}

function getSelectionModeRuntimeSendMessage(): ((message: unknown) => Promise<unknown>) | null {
  return getSelectionModeRuntime()?.sendMessage ?? null;
}

async function submitSelectionCandidate(store: SelectionModeStore): Promise<void> {
  store.lastErrorOutcome = null;
  const selectedCandidate = store.selectedCandidate;
  const options = store.options;
  const sendMessage = getSelectionModeRuntimeSendMessage();

  if (!selectedCandidate || !options || !sendMessage) {
    setSelectionModeStatus(
      store,
      'error',
      'PageMint couldn’t reach the background runtime for this selection.',
      'Retry the selection, or reopen the popup and try again.',
      {
        selectedCandidate,
        hoverPreview: null
      }
    );
    return;
  }

  setSelectionModeStatus(
    store,
    'submitting',
    submittingSelectionMessage,
    '',
    {
      selectedCandidate,
      hoverPreview: null
    }
  );

  setSelectionModeChromeHidden(store, true);
  try {
    const response = await sendMessage({
      kind: 'selection-mode.capture-and-stage',
      request: selectedCandidate.request,
      pageRequest: options.pageRequest,
      viewport: selectedCandidate.viewport,
      preferredManagedDelivery: options.preferredManagedDelivery
    } satisfies SelectionModeCaptureAndStageMessage) as SelectionModeCaptureAndStageResponse;

    setSelectionModeChromeHidden(store, false);

    if (!response.ok) {
      setSelectionModeStatus(
        store,
        'error',
        'PageMint couldn’t stage that selection.',
        response.message,
        {
          selectedCandidate,
          hoverPreview: null
        }
      );
      return;
    }

    const copy = describeSelectionResult(response.result);
    store.lastErrorOutcome = response.result.outcome === 'confirmed' ? null : response.result.outcome;
    if (response.result.outcome === 'confirmed') {
      store.stagedSessionId = (response as { session?: { sessionId?: string } | null }).session?.sessionId ?? null;
      store.stagedDeliveryClass = (response as { session?: { deliveryClass?: string } | null }).session?.deliveryClass as ('managed-pdf-asset' | 'browser-print-handoff' | null) ?? null;
    }
    setSelectionModeStatus(
      store,
      response.result.outcome === 'confirmed' ? 'completed' : 'error',
      copy.message,
      copy.detail,
      {
        selectedCandidate,
        hoverPreview: null
      }
    );
  } catch (error) {
    setSelectionModeChromeHidden(store, false);
    setSelectionModeStatus(
      store,
      'error',
      'PageMint couldn’t stage that selection.',
      normalizeExtensionErrorMessage(error) || 'Retry the same boundary, or fall back to whole-page export explicitly.',
      {
        selectedCandidate,
        hoverPreview: null
      }
    );
  }
}

async function submitWholePageFallback(store: SelectionModeStore): Promise<void> {
  store.lastErrorOutcome = null;
  const options = store.options;
  const sendMessage = getSelectionModeRuntimeSendMessage();

  if (store.phase === 'submitting') {
    return;
  }

  if (!options || !sendMessage) {
    setSelectionModeStatus(
      store,
      'error',
      'PageMint couldn’t reach the whole-page fallback runtime.',
      'Reopen the popup on this tab if you still want the whole-page export path.',
      {
        selectedCandidate: store.selectedCandidate,
        hoverPreview: null
      }
    );
    return;
  }

  setSelectionModeStatus(
    store,
    'submitting',
    submittingWholePageMessage,
    '',
    {
      selectedCandidate: store.selectedCandidate,
      hoverPreview: null
    }
  );

  try {
    const response = await sendMessage({
      kind: 'exact-export.stage-run',
      request: options.pageRequest,
      highFidelityModePreferenceEnabled: options.highFidelityModePreferenceEnabled,
      managedDeliveryPreference: options.preferredManagedDelivery
    }) as ExactExportStageRunResponse;

    if (!response.ok) {
      setSelectionModeStatus(
        store,
        'error',
        errorSelectionGenericMessage,
        response.run.finalResult.failure.message,
        {
          selectedCandidate: store.selectedCandidate,
          hoverPreview: null
        }
      );
      return;
    }

    const message = response.session.deliveryClass === 'managed-pdf-asset'
      ? completedWholePageManagedMessage
      : completedWholePagePrintMessage;

    store.stagedSessionId = response.session.sessionId ?? null;
    store.stagedDeliveryClass = response.session.deliveryClass;

    setSelectionModeStatus(
      store,
      'completed',
      message,
      '',
      {
        selectedCandidate: store.selectedCandidate,
        hoverPreview: null
      }
    );
  } catch (error) {
    setSelectionModeStatus(
      store,
      'error',
      errorSelectionGenericMessage,
      normalizeExtensionErrorMessage(error) || 'Retry, or capture the whole page instead.',
      {
        selectedCandidate: store.selectedCandidate,
        hoverPreview: null
      }
    );
  }
}

async function submitSaveStaged(store: SelectionModeStore, copy: boolean): Promise<void> {
  const sendMessage = getSelectionModeRuntimeSendMessage();
  const sessionId = store.stagedSessionId;

  if (!sessionId || !sendMessage) {
    store.lastErrorOutcome = 'session-not-found';
    setSelectionModeStatus(
      store,
      'save-error',
      errorSelectionExpiredTitle,
      errorSelectionExpiredDetail,
      { selectedCandidate: store.selectedCandidate, hoverPreview: null }
    );
    return;
  }

  setSelectionModeStatus(
    store,
    'saving',
    savingSelectionMessage,
    '',
    { selectedCandidate: store.selectedCandidate, hoverPreview: null }
  );

  if (store.saveTimeoutHandle !== null) {
    clearTimeout(store.saveTimeoutHandle);
  }
  store.saveTimeoutHandle = setTimeout(() => {
    store.saveTimeoutHandle = null;
    if (store.phase === 'saving') {
      store.lastErrorOutcome = 'save-timeout';
      setSelectionModeStatus(
        store,
        'save-error',
        savingTimeoutTitle,
        savingTimeoutDetail,
        { selectedCandidate: store.selectedCandidate, hoverPreview: null }
      );
    }
  }, 30000);

  try {
    const response = await sendMessage({
      kind: 'selection-mode.save-staged',
      sessionId,
      copy
    });

    if (store.saveTimeoutHandle !== null) {
      clearTimeout(store.saveTimeoutHandle);
      store.saveTimeoutHandle = null;
    }

    // If the timeout already fired and moved us out of saving, discard the late response.
    if (store.phase !== 'saving') return;

    const result = response as { ok: boolean; reason?: string; message?: string; fileName?: string };
    if (result.ok) {
      const fileName = result.fileName ?? '';
      const message = fileName ? `${savedSelectionPrefix} · ${fileName}` : savedSelectionPrefix;
      setSelectionModeStatus(
        store,
        'saved',
        message,
        '',
        { selectedCandidate: store.selectedCandidate, hoverPreview: null }
      );
      store.lastErrorOutcome = null;
      return;
    }

    const reason = (result.reason ?? 'download-failed') as 'session-not-found' | 'permission-denied' | 'download-failed';
    const title = reason === 'session-not-found' ? errorSelectionExpiredTitle : errorSaveFailedTitle;
    const detail = reason === 'session-not-found' ? errorSelectionExpiredDetail : (result.message ?? 'Retry, or open the viewer to save manually.');
    store.lastErrorOutcome = reason;
    setSelectionModeStatus(
      store,
      'save-error',
      title,
      detail,
      { selectedCandidate: store.selectedCandidate, hoverPreview: null }
    );
  } catch (error) {
    if (store.saveTimeoutHandle !== null) {
      clearTimeout(store.saveTimeoutHandle);
      store.saveTimeoutHandle = null;
    }
    // If the timeout already fired and transitioned us out of `saving`, drop
    // this late rejection. Otherwise it would overwrite the timeout toast's
    // "Lost track of save." copy with a generic save-error and a Retry save
    // button — but the original download likely succeeded.
    if (store.phase !== 'saving') {
      return;
    }
    store.lastErrorOutcome = 'download-failed';
    setSelectionModeStatus(
      store,
      'save-error',
      errorSaveFailedTitle,
      normalizeExtensionErrorMessage(error) || 'Retry, or open the viewer to save manually.',
      { selectedCandidate: store.selectedCandidate, hoverPreview: null }
    );
  }
}

async function submitOpenViewer(store: SelectionModeStore): Promise<void> {
  const sendMessage = getSelectionModeRuntimeSendMessage();
  const sessionId = store.stagedSessionId;
  if (!sessionId || !sendMessage) {
    return;
  }
  try {
    await sendMessage({ kind: 'selection-mode.open-viewer', sessionId });
  } catch {
    // Best-effort. Viewer-open failure does not break the toolbar.
  }
  cleanupSelectionModeUi(store);
}

async function submitOpenPrintDialog(store: SelectionModeStore): Promise<void> {
  const sendMessage = getSelectionModeRuntimeSendMessage();
  const sessionId = store.stagedSessionId;
  if (!sessionId || !sendMessage) {
    return;
  }
  try {
    await sendMessage({
      kind: 'exact-export.staged-session.resume-browser-print',
      sessionId
    });
  } catch {
    // Best-effort. The handoff-resume failure path is owned by the
    // staged-session handler.
  }
  cleanupSelectionModeUi(store);
}

function cleanupSelectionModeUi(store: SelectionModeStore): void {
  if (store.listeners) {
    document.removeEventListener('mousemove', store.listeners.mousemove, true);
    document.removeEventListener('click', store.listeners.click, true);
    document.removeEventListener('pointerdown', store.listeners.pointerdown, true);
    document.removeEventListener('pointermove', store.listeners.pointermove, true);
    document.removeEventListener('pointerup', store.listeners.pointerup, true);
    document.removeEventListener('contextmenu', store.listeners.contextmenu, true);
    document.removeEventListener('keydown', store.listeners.keydown, true);
    document.removeEventListener('wheel', store.listeners.wheel, true);
    store.listeners = undefined;
  }

  if (store.coachTimeoutHandle !== null) {
    clearTimeout(store.coachTimeoutHandle);
    store.coachTimeoutHandle = null;
  }
  if (store.saveTimeoutHandle !== null) {
    clearTimeout(store.saveTimeoutHandle);
    store.saveTimeoutHandle = null;
  }
  store.coachElement?.remove();
  store.coachElement = null;
  store.rootElement?.remove();
  store.styleElement?.remove();
  store.dimChipElement?.remove();
  store.dimChipElement = null;
  store.rootElement = null;
  store.panelElement = null;
  store.selectionBoxElement = null;
  store.regionBoxElement = null;
  store.styleElement = null;
  store.active = false;
  store.phase = 'choosing';
  store.suppressNextClick = false;
  store.lastErrorOutcome = null;
  store.selectedCandidate = null;
  store.hoverPreview = null;
  store.options = null;
  store.stagedSessionId = null;
  store.stagedDeliveryClass = null;
  clearDragSelection(store);
  store.message = defaultSelectionChoosingMessage;
  store.detail = defaultSelectionChoosingDetail;
  store.overflowMenuOpen = false;
  store.coachVisible = false;
  store.coachInteractionSeen = false;
}

function createButton(
  label: string,
  options: {
    tone?: 'primary' | 'secondary' | 'ghost' | 'icon';
    disabled?: boolean;
    ariaLabel?: string;
    onClick?: () => void;
  } = {}
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  const tone = options.tone ?? 'secondary';
  const toneClass = tone === 'primary'
    ? 'pagemint-selection-mode__button--primary'
    : tone === 'ghost'
      ? 'pagemint-selection-mode__button--ghost'
      : tone === 'icon'
        ? 'pagemint-selection-mode__button--icon'
        : '';
  button.className = `pagemint-selection-mode__button ${toneClass}`.trim();
  button.textContent = label;
  button.disabled = options.disabled === true;

  if (options.ariaLabel) {
    button.setAttribute('aria-label', options.ariaLabel);
  }

  if (options.onClick) {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      options.onClick?.();
    });
  }

  return button;
}

function renderSelectionModeUi(store: SelectionModeStore): void {
  const panel = store.panelElement;
  if (!panel) {
    return;
  }

  panel.replaceChildren();
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'PageMint selection mode');

  const brand = document.createElement('span');
  brand.className = 'pagemint-selection-mode__brand';
  brand.textContent = (store.phase === 'completed' || store.phase === 'saved') ? '✓' : 'P';
  panel.append(brand);

  const status = document.createElement('span');
  status.className = 'pagemint-selection-mode__status'
    + (store.phase === 'error' ? ' pagemint-selection-mode__status-error' : '');
  status.setAttribute('aria-live', 'polite');

  const showCandidateInfo = (store.phase === 'choosing' || store.phase === 'selected')
    && (store.selectedCandidate !== null || store.hoverPreview !== null);

  if (showCandidateInfo) {
    const candidate = store.selectedCandidate ?? null;
    const preview = store.hoverPreview ?? null;
    const label = candidate?.label ?? preview?.label ?? '';
    const bounds = candidate
      ? candidate.request.selection.boundary.bounds
      : preview
        ? { width: preview.rect.width, height: preview.rect.height }
        : null;

    if (label) {
      status.textContent = label;
    } else {
      status.textContent = store.message;
    }

    if (bounds) {
      const dim = document.createElement('span');
      dim.className = 'pagemint-selection-mode__dim';
      dim.textContent = `${Math.round(bounds.width)} × ${Math.round(bounds.height)}`;
      status.append(dim);
    }
  } else {
    status.textContent = store.message;
  }

  panel.append(status);

  const sep = document.createElement('span');
  sep.className = 'pagemint-selection-mode__sep';
  sep.setAttribute('aria-hidden', 'true');
  panel.append(sep);

  const actionRow = document.createElement('span');
  actionRow.className = 'pagemint-selection-mode__row';

  if (store.phase === 'selected') {
    const overflowButton = createButton('⋯', {
      tone: 'icon',
      ariaLabel: 'More options',
      onClick: () => { toggleOverflowMenu(store); }
    });
    overflowButton.setAttribute('data-pagemint-overflow-toggle', '');
    actionRow.append(
      createButton('Capture', {
        tone: 'primary',
        onClick: () => { void submitSelectionCandidate(store); }
      }),
      createButton('Retry', {
        tone: 'secondary',
        onClick: () => { resetSelectionChoice(store); }
      }),
      overflowButton
    );
  } else if (store.phase === 'submitting') {
    actionRow.append(
      createButton('Capturing…', {
        tone: 'primary',
        disabled: true
      })
    );
  } else if (store.phase === 'completed') {
    if (store.stagedDeliveryClass === 'browser-print-handoff') {
      // Whole-page fallback produced a browser-print handoff (no PDF
      // bytes). Save would 404 against the registry, and the viewer can't
      // render a print-handoff session. Route the user to Chrome's print
      // dialog via the existing handoff path.
      actionRow.append(
        createButton('Open in print dialog', {
          tone: 'primary',
          ariaLabel: 'Open this page in Chrome\'s print dialog',
          onClick: () => { void submitOpenPrintDialog(store); }
        }),
        createButton('Cancel', {
          tone: 'ghost',
          onClick: () => { cleanupSelectionModeUi(store); }
        })
      );
    } else {
      actionRow.append(
        createButton('Save', {
          tone: 'primary',
          ariaLabel: 'Save PDF to your downloads folder',
          onClick: () => { void submitSaveStaged(store, false); }
        }),
        createButton('Open viewer', {
          tone: 'secondary',
          onClick: () => { void submitOpenViewer(store); }
        }),
        createButton('Cancel', {
          tone: 'ghost',
          onClick: () => { cleanupSelectionModeUi(store); }
        })
      );
    }
  } else if (store.phase === 'saving') {
    actionRow.append(
      createButton('Saving…', {
        tone: 'primary',
        disabled: true
      })
    );
  } else if (store.phase === 'saved') {
    actionRow.append(
      createButton('Save another copy', {
        tone: 'secondary',
        ariaLabel: 'Save another copy of this PDF',
        onClick: () => { void submitSaveStaged(store, true); }
      }),
      createButton('Open viewer', {
        tone: 'secondary',
        onClick: () => { void submitOpenViewer(store); }
      }),
      createButton('Done', {
        tone: 'primary',
        onClick: () => { cleanupSelectionModeUi(store); }
      })
    );
  } else if (store.phase === 'save-error') {
    const overflowButton = createButton('⋯', {
      tone: 'icon',
      ariaLabel: 'More options',
      onClick: () => { toggleOverflowMenu(store); }
    });
    overflowButton.setAttribute('data-pagemint-overflow-toggle', '');
    actionRow.append(
      overflowButton,
      createButton('Cancel', {
        tone: 'ghost',
        onClick: () => { cleanupSelectionModeUi(store); }
      })
    );
  } else if (store.phase === 'error') {
    const overflowButton = createButton('⋯', {
      tone: 'icon',
      ariaLabel: 'More options',
      onClick: () => { toggleOverflowMenu(store); }
    });
    overflowButton.setAttribute('data-pagemint-overflow-toggle', '');
    actionRow.append(
      overflowButton,
      createButton('Cancel', {
        tone: 'ghost',
        onClick: () => { cleanupSelectionModeUi(store); }
      })
    );
  } else {
    const overflowButton = createButton('⋯', {
      tone: 'icon',
      ariaLabel: 'More options',
      onClick: () => { toggleOverflowMenu(store); }
    });
    overflowButton.setAttribute('data-pagemint-overflow-toggle', '');
    actionRow.append(
      overflowButton,
      createButton('Cancel', {
        tone: 'ghost',
        onClick: () => { cleanupSelectionModeUi(store); }
      })
    );
  }

  panel.append(actionRow);

  const activeBounds = store.selectedCandidate
    ? toViewportRect(store.selectedCandidate.request.selection.boundary.bounds)
    : null;
  const hoverBounds = store.hoverPreview
    ? {
        x: store.hoverPreview.rect.left,
        y: store.hoverPreview.rect.top,
        width: store.hoverPreview.rect.width,
        height: store.hoverPreview.rect.height
      }
    : null;
  const dragBounds = store.dragAnchor && store.dragFocus
    ? {
        x: Math.min(store.dragAnchor.x, store.dragFocus.x),
        y: Math.min(store.dragAnchor.y, store.dragFocus.y),
        width: Math.abs(store.dragFocus.x - store.dragAnchor.x),
        height: Math.abs(store.dragFocus.y - store.dragAnchor.y)
      }
    : null;

  const showElementBounds = (store.phase === 'choosing' && store.currentMode === 'element' && hoverBounds)
    || (store.selectedCandidate?.request.selection.boundary.kind === 'element' && activeBounds);
  const showRegionBounds = (store.currentMode === 'region' && dragBounds && store.phase === 'choosing')
    || (store.selectedCandidate?.request.selection.boundary.kind === 'region' && activeBounds);

  applyOverlayRect(
    store.selectionBoxElement,
    store.selectedCandidate?.request.selection.boundary.kind === 'element'
      ? activeBounds
      : hoverBounds,
    Boolean(showElementBounds),
    {
      toneClass: 'element',
      dashed: store.phase === 'choosing'
    }
  );
  applyOverlayRect(
    store.regionBoxElement,
    store.selectedCandidate?.request.selection.boundary.kind === 'region'
      ? activeBounds
      : dragBounds,
    Boolean(showRegionBounds),
    {
      toneClass: 'region',
      dashed: store.phase === 'choosing'
    }
  );

  renderSelectionModeToast(store);
  renderOverflowMenu(store);
}

function renderSelectionModeToast(store: SelectionModeStore): void {
  if (!store.rootElement) {
    return;
  }

  store.rootElement.querySelector('.pagemint-selection-mode__toast')?.remove();

  const isCaptureError = store.phase === 'error';
  const isSaveError = store.phase === 'save-error';
  if (!isCaptureError && !isSaveError) {
    return;
  }
  if (!store.detail) {
    return;
  }

  const toast = document.createElement('div');
  toast.className = 'pagemint-selection-mode__toast';
  toast.setAttribute('role', 'alert');

  const title = document.createElement('p');
  title.className = 'pagemint-selection-mode__toast-title';
  title.textContent = store.message;
  toast.append(title);

  const detail = document.createElement('p');
  detail.style.margin = '0';
  detail.textContent = store.detail;
  toast.append(detail);

  const actions = document.createElement('div');
  actions.className = 'pagemint-selection-mode__toast-actions';

  if (isSaveError) {
    if (store.lastErrorOutcome === 'session-not-found') {
      const captureAgainButton = document.createElement('button');
      captureAgainButton.type = 'button';
      captureAgainButton.className = 'pagemint-selection-mode__toast-button';
      captureAgainButton.textContent = 'Capture again';
      captureAgainButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        store.stagedSessionId = null;
        resetSelectionChoice(store);
      });
      actions.append(captureAgainButton);
    } else if (store.lastErrorOutcome === 'save-timeout') {
      // Timeout means we lost track of the save's outcome. The staged
      // registry may have died with the service worker, so Open viewer
      // would 404. Offer Cancel only — Chrome's download chip is the
      // authoritative status.
      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'pagemint-selection-mode__toast-button';
      cancelButton.textContent = 'Cancel';
      cancelButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        cleanupSelectionModeUi(store);
      });
      actions.append(cancelButton);
    } else {
      const retryButton = document.createElement('button');
      retryButton.type = 'button';
      retryButton.className = 'pagemint-selection-mode__toast-button';
      retryButton.textContent = 'Retry save';
      retryButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void submitSaveStaged(store, false);
      });
      const openViewerButton = document.createElement('button');
      openViewerButton.type = 'button';
      openViewerButton.className = 'pagemint-selection-mode__toast-button pagemint-selection-mode__toast-button--ghost';
      openViewerButton.textContent = 'Open viewer';
      openViewerButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void submitOpenViewer(store);
      });
      actions.append(retryButton, openViewerButton);
    }
  } else {
    const wholePageButton = document.createElement('button');
    wholePageButton.type = 'button';
    wholePageButton.className = 'pagemint-selection-mode__toast-button';
    wholePageButton.textContent = 'Whole page';
    wholePageButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void submitWholePageFallback(store);
    });

    const retryButton = document.createElement('button');
    retryButton.type = 'button';
    retryButton.className = 'pagemint-selection-mode__toast-button pagemint-selection-mode__toast-button--ghost';
    retryButton.textContent = 'Try again';
    retryButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      resetSelectionChoice(store);
    });

    if (store.lastErrorOutcome === 'unsupported-surface') {
      actions.append(retryButton);
    } else {
      actions.append(wholePageButton, retryButton);
    }
  }

  toast.append(actions);
  store.rootElement.append(toast);
}

function toggleOverflowMenu(store: SelectionModeStore): void {
  store.overflowMenuOpen = !store.overflowMenuOpen;
  renderSelectionModeUi(store);
}

function closeOverflowMenu(store: SelectionModeStore): void {
  if (!store.overflowMenuOpen) {
    return;
  }
  store.overflowMenuOpen = false;
  renderSelectionModeUi(store);
}

function isSelectionModeMenuNode(candidate: EventTarget | null | undefined): boolean {
  return candidate instanceof Element && Boolean(candidate.closest('.pagemint-selection-mode__menu'));
}

function isSelectionModeOverflowToggleNode(candidate: EventTarget | null | undefined): boolean {
  return candidate instanceof Element && Boolean(candidate.closest('[data-pagemint-overflow-toggle]'));
}

function renderOverflowMenu(store: SelectionModeStore): void {
  if (!store.rootElement) {
    return;
  }

  store.rootElement.querySelector('.pagemint-selection-mode__menu')?.remove();

  if (!store.overflowMenuOpen) {
    return;
  }

  const menu = document.createElement('div');
  menu.className = 'pagemint-selection-mode__menu';
  menu.setAttribute('role', 'menu');

  const wholePageItem = document.createElement('button');
  wholePageItem.type = 'button';
  wholePageItem.className = 'pagemint-selection-mode__menu-item';
  wholePageItem.setAttribute('role', 'menuitem');
  wholePageItem.append(
    document.createTextNode('Capture whole page'),
    Object.assign(document.createElement('span'), {
      className: 'pagemint-selection-mode__menu-item-key',
      textContent: '⇧⌘P'
    })
  );
  wholePageItem.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeOverflowMenu(store);
    void submitWholePageFallback(store);
  });
  wholePageItem.setAttribute('data-pagemint-overflow-menu-item', '');

  const shortcutsItem = document.createElement('button');
  shortcutsItem.type = 'button';
  shortcutsItem.className = 'pagemint-selection-mode__menu-item';
  shortcutsItem.setAttribute('role', 'menuitem');
  shortcutsItem.setAttribute('data-pagemint-overflow-menu-item', '');
  shortcutsItem.append(
    document.createTextNode('Show keyboard shortcuts'),
    Object.assign(document.createElement('span'), {
      className: 'pagemint-selection-mode__menu-item-key',
      textContent: '?'
    })
  );
  shortcutsItem.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    // The shortcut sheet is a v2 feature. For v1 the menu items already
    // print their shortcut hints (⇧⌘P, Esc) inline, so reading them is
    // the action. Close the menu so the click feels like an intentional
    // dismissal rather than a no-op.
    closeOverflowMenu(store);
  });

  const sep = document.createElement('div');
  sep.className = 'pagemint-selection-mode__menu-sep';

  const cancelItem = document.createElement('button');
  cancelItem.type = 'button';
  cancelItem.className = 'pagemint-selection-mode__menu-item pagemint-selection-mode__menu-item--danger';
  cancelItem.setAttribute('role', 'menuitem');
  cancelItem.append(
    document.createTextNode('Cancel selection'),
    Object.assign(document.createElement('span'), {
      className: 'pagemint-selection-mode__menu-item-key',
      textContent: 'Esc'
    })
  );
  cancelItem.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    cleanupSelectionModeUi(store);
  });

  menu.append(wholePageItem, shortcutsItem, sep, cancelItem);
  store.rootElement.append(menu);
}

async function showCoachIfFirstRun(store: SelectionModeStore): Promise<void> {
  if (store.coachVisible || store.coachInteractionSeen || !store.rootElement) {
    return;
  }

  const seen = await loadSelectionModeCoachSeen();
  if (seen) {
    return;
  }

  // Re-check active state after the async storage read — the user could have
  // pressed Esc in the meantime and `cleanupSelectionModeUi` could have run.
  if (!store.active || !store.rootElement || store.coachVisible || store.coachInteractionSeen) {
    return;
  }

  const coach = document.createElement('div');
  coach.className = 'pagemint-selection-mode__coach';
  coach.setAttribute('role', 'status');
  coach.textContent = 'Click an element, or drag for a region. Esc cancels.';

  store.rootElement.append(coach);
  store.coachElement = coach;
  store.coachVisible = true;

  if (store.coachTimeoutHandle !== null) {
    clearTimeout(store.coachTimeoutHandle);
  }
  store.coachTimeoutHandle = setTimeout(() => {
    store.coachTimeoutHandle = null;
    dismissCoach(store);
  }, 3000);
}

function dismissCoach(store: SelectionModeStore): void {
  if (store.coachInteractionSeen && !store.coachVisible) {
    return;
  }
  store.coachInteractionSeen = true;
  if (store.coachTimeoutHandle !== null) {
    clearTimeout(store.coachTimeoutHandle);
    store.coachTimeoutHandle = null;
  }
  store.coachElement?.remove();
  store.coachElement = null;
  store.coachVisible = false;
  void markSelectionModeCoachSeen();
}

function ensureSelectionModePresentation(store: SelectionModeStore): void {
  if (!store.styleElement) {
    const styleElement = document.createElement('style');
    styleElement.id = selectionModeStyleId;
    styleElement.textContent = `
      #${selectionModeRootId} {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 2147483646;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      .pagemint-selection-mode__panel {
        position: fixed;
        bottom: 14px;
        left: 50%;
        transform: translateX(-50%);
        max-width: calc(100vw - 32px);
        padding: 6px 6px 6px 14px;
        border-radius: 999px;
        background: #17130E;
        color: #F4EEE1;
        box-shadow: 0 12px 28px rgba(15, 19, 14, 0.4), 0 0 0 1px rgba(216, 207, 185, 0.16);
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 12px;
        line-height: 1;
      }

      .pagemint-selection-mode__brand {
        width: 18px;
        height: 18px;
        border-radius: 999px;
        background: #4A7A5A;
        color: #F4EEE1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
        flex: 0 0 auto;
      }

      .pagemint-selection-mode__status {
        color: #F4EEE1;
        opacity: 0.92;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 260px;
      }

      .pagemint-selection-mode__status-error {
        color: #f3b3b3;
      }

      .pagemint-selection-mode__dim {
        color: rgba(244, 238, 225, 0.55);
        font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
        font-size: 11px;
        margin-left: 6px;
      }

      .pagemint-selection-mode__sep {
        width: 1px;
        align-self: stretch;
        background: rgba(216, 207, 185, 0.18);
        margin: 2px 0;
        flex: 0 0 auto;
      }

      .pagemint-selection-mode__row {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .pagemint-selection-mode__button {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 6px 12px;
        font: inherit;
        line-height: 1;
        cursor: pointer;
        background: rgba(244, 238, 225, 0.06);
        color: #F4EEE1;
        transition: background 120ms ease, transform 120ms ease;
      }

      .pagemint-selection-mode__button:hover:enabled {
        background: rgba(244, 238, 225, 0.12);
      }

      .pagemint-selection-mode__button:focus-visible {
        outline: 2px solid #4A7A5A;
        outline-offset: 2px;
      }

      .pagemint-selection-mode__button:disabled {
        opacity: 0.6;
        cursor: progress;
      }

      .pagemint-selection-mode__button--primary {
        background: #4A7A5A;
        color: #F4EEE1;
        font-weight: 600;
      }

      .pagemint-selection-mode__button--primary:hover:enabled {
        background: #3f6a4d;
      }

      .pagemint-selection-mode__button--ghost {
        background: transparent;
        color: rgba(244, 238, 225, 0.66);
        padding: 6px 8px;
      }

      .pagemint-selection-mode__button--icon {
        width: 26px;
        height: 26px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .pagemint-selection-mode__kbd {
        color: rgba(244, 238, 225, 0.46);
        font-family: ui-monospace, SFMono-Regular, monospace;
        font-size: 10px;
        margin-left: 6px;
      }

      .pagemint-selection-mode__box {
        position: fixed;
        display: none;
        box-sizing: border-box;
        pointer-events: none;
        border-radius: 4px;
        z-index: 2147483645;
        border: 2px solid #4A7A5A;
        background: rgba(74, 122, 90, 0.14);
        box-shadow: 0 0 0 1px rgba(244, 238, 225, 0.5) inset;
      }

      .pagemint-selection-mode__box--dashed {
        border-style: dashed;
        background: rgba(74, 122, 90, 0.07);
      }

      .pagemint-selection-mode__dim-chip {
        position: fixed;
        background: #17130E;
        color: #F4EEE1;
        font-family: ui-monospace, SFMono-Regular, monospace;
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 6px;
        box-shadow: 0 4px 10px rgba(15, 19, 14, 0.4);
        pointer-events: none;
        z-index: 2147483646;
        display: none;
      }

      .pagemint-selection-mode__coach {
        position: fixed;
        bottom: 64px;
        left: 50%;
        transform: translateX(-50%);
        background: #4A7A5A;
        color: #F4EEE1;
        padding: 8px 12px;
        border-radius: 10px;
        font-size: 12px;
        line-height: 1.4;
        box-shadow: 0 10px 24px rgba(74, 122, 90, 0.4);
        max-width: 260px;
        pointer-events: auto;
      }

      .pagemint-selection-mode__coach::after {
        content: '';
        position: absolute;
        left: 50%;
        bottom: -6px;
        transform: translateX(-50%) rotate(45deg);
        width: 12px;
        height: 12px;
        background: #4A7A5A;
      }

      .pagemint-selection-mode__menu {
        position: fixed;
        bottom: 64px;
        right: 50%;
        margin-right: -130px;
        background: #17130E;
        color: #F4EEE1;
        border-radius: 12px;
        padding: 6px;
        font-size: 12px;
        min-width: 220px;
        box-shadow: 0 12px 28px rgba(15, 19, 14, 0.5), 0 0 0 1px rgba(216, 207, 185, 0.16);
        pointer-events: auto;
      }

      .pagemint-selection-mode__menu-item {
        appearance: none;
        background: transparent;
        border: 0;
        width: 100%;
        text-align: left;
        padding: 7px 10px;
        border-radius: 8px;
        color: inherit;
        font: inherit;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        gap: 12px;
      }

      .pagemint-selection-mode__menu-item:hover {
        background: rgba(244, 238, 225, 0.06);
      }

      .pagemint-selection-mode__menu-item--danger {
        color: #f3b3b3;
      }

      .pagemint-selection-mode__menu-item-key {
        color: rgba(244, 238, 225, 0.45);
        font-family: ui-monospace, SFMono-Regular, monospace;
        font-size: 10px;
      }

      .pagemint-selection-mode__menu-sep {
        height: 1px;
        background: rgba(216, 207, 185, 0.16);
        margin: 4px 6px;
      }

      .pagemint-selection-mode__toast {
        position: fixed;
        bottom: 64px;
        left: 50%;
        transform: translateX(-50%);
        background: #F4EEE1;
        color: #17130E;
        border: 1px solid #D8CFB9;
        border-radius: 10px;
        padding: 10px 14px;
        font-size: 12px;
        line-height: 1.4;
        max-width: 320px;
        box-shadow: 0 10px 24px rgba(15, 19, 14, 0.18);
        pointer-events: auto;
      }

      .pagemint-selection-mode__toast-title {
        color: #7a1f1f;
        font-weight: 600;
        margin: 0 0 4px;
      }

      .pagemint-selection-mode__toast-actions {
        display: flex;
        gap: 6px;
        margin-top: 8px;
      }

      .pagemint-selection-mode__toast-button {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 6px 12px;
        font: inherit;
        line-height: 1;
        cursor: pointer;
        background: #17130E;
        color: #F4EEE1;
      }

      .pagemint-selection-mode__toast-button--ghost {
        background: transparent;
        color: #17130E;
        border: 1px solid #D8CFB9;
      }
    `;
    (document.head ?? document.documentElement).append(styleElement);
    store.styleElement = styleElement;
  }

  if (!store.rootElement) {
    const rootElement = document.createElement('div');
    rootElement.id = selectionModeRootId;

    const panelElement = document.createElement('div');
    panelElement.id = selectionModePanelId;
    panelElement.className = 'pagemint-selection-mode__panel';

    const selectionBoxElement = document.createElement('div');
    const regionBoxElement = document.createElement('div');

    const dimChipElement = document.createElement('div');
    dimChipElement.className = 'pagemint-selection-mode__dim-chip';
    dimChipElement.setAttribute('aria-hidden', 'true');
    rootElement.append(selectionBoxElement, regionBoxElement, panelElement);
    rootElement.append(dimChipElement);
    (document.body ?? document.documentElement).append(rootElement);

    store.rootElement = rootElement;
    store.panelElement = panelElement;
    store.selectionBoxElement = selectionBoxElement;
    store.regionBoxElement = regionBoxElement;
    store.dimChipElement = dimChipElement;
  }
}

function getEventTargetElement(event: Event): HTMLElement | null {
  return event.target instanceof HTMLElement ? event.target : null;
}

function resolveSelectionTargetElement(event: Event): HTMLElement | null {
  const target = getEventTargetElement(event);

  if (!target) {
    return null;
  }

  if (isSelectionModeUiNode(target)) {
    return null;
  }

  if (
    target === document.documentElement
    || target === document.body
    || target === document.head
  ) {
    return null;
  }

  if (['HEAD', 'STYLE', 'SCRIPT', 'LINK', 'META', 'TITLE'].includes(target.tagName)) {
    return null;
  }

  return target;
}

function getSelectionElementParent(element: HTMLElement): HTMLElement | null {
  const parent = element.parentElement;

  if (
    !parent
    || parent === document.documentElement
    || parent === document.body
    || parent === document.head
  ) {
    return null;
  }

  return parent;
}

function isVisibleElementSelectionRect(rect: DOMRect): boolean {
  return rect.width >= minimumSelectionDimension
    && rect.height >= minimumSelectionDimension
    && rect.left >= 0
    && rect.top >= 0
    && rect.right <= globalThis.innerWidth
    && rect.bottom <= globalThis.innerHeight;
}

function resolveVisibleSelectionTargetElement(event: Event): HTMLElement | null {
  let element = resolveSelectionTargetElement(event);

  while (element) {
    const rect = element.getBoundingClientRect();

    if (isVisibleElementSelectionRect(rect)) {
      return element;
    }

    element = getSelectionElementParent(element);
  }

  return null;
}

function normalizeTextPreview(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/gu, ' ').trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.slice(0, 160);
}

function describeElementCandidate(element: HTMLElement): { label: string; textPreview?: string } {
  const explicitLabel = normalizeTextPreview(
    element.getAttribute('aria-label')
    || element.getAttribute('title')
    || element.getAttribute('data-testid')
  );
  const textPreview = normalizeTextPreview(element.textContent);
  const tagLabel = element.tagName.toLowerCase();

  return {
    label: explicitLabel ?? textPreview ?? tagLabel,
    textPreview
  };
}

function createElementSelectionCandidate(
  store: SelectionModeStore,
  element: HTMLElement
): SelectionModeSelectionCandidate | null {
  const options = store.options;
  if (!options) {
    return null;
  }

  const rect = element.getBoundingClientRect();

  if (!isVisibleElementSelectionRect(rect)) {
    return null;
  }

  const description = describeElementCandidate(element);
  const boundary: ElementSelectionBoundary = {
    kind: 'element',
    bounds: {
      x: globalThis.scrollX + rect.left,
      y: globalThis.scrollY + rect.top,
      width: rect.width,
      height: rect.height
    },
    pageBounds: getSelectionModePageBounds(document),
    element: {
      tagName: element.tagName.toLowerCase(),
      role: normalizeTextPreview(element.getAttribute('role')),
      label: description.label,
      textPreview: description.textPreview
    }
  };
  const request = buildElementSelectionRequest(options.pageRequest.target, boundary);
  const validation = validateSelectionRequest(request);

  if (!validation.ok) {
    const invalidResult = createSelectionValidationFailureResult(request, validation);
    const copy = describeSelectionResult(invalidResult);

    setSelectionModeStatus(store, 'error', copy.message, copy.detail, {
      selectedCandidate: null,
      hoverPreview: null
    });
    return null;
  }

  return {
    request,
    viewport: createViewportSnapshot(),
    label: description.label
  };
}

function createRegionSelectionCandidate(store: SelectionModeStore): SelectionModeSelectionCandidate | null {
  const options = store.options;
  const dragAnchor = store.dragAnchor;
  const dragFocus = store.dragFocus;

  if (!options || !dragAnchor || !dragFocus) {
    return null;
  }

  const bounds: SelectionRect = {
    x: globalThis.scrollX + Math.min(dragAnchor.x, dragFocus.x),
    y: globalThis.scrollY + Math.min(dragAnchor.y, dragFocus.y),
    width: Math.abs(dragFocus.x - dragAnchor.x),
    height: Math.abs(dragFocus.y - dragAnchor.y)
  };
  const boundary: RegionSelectionBoundary = {
    kind: 'region',
    bounds,
    pageBounds: getSelectionModePageBounds(document),
    anchor: {
      x: globalThis.scrollX + dragAnchor.x,
      y: globalThis.scrollY + dragAnchor.y
    },
    focus: {
      x: globalThis.scrollX + dragFocus.x,
      y: globalThis.scrollY + dragFocus.y
    }
  };
  const request = buildRegionSelectionRequest(options.pageRequest.target, boundary);
  const validation = validateSelectionRequest(request);

  if (!validation.ok) {
    const invalidResult = createSelectionValidationFailureResult(request, validation);
    const copy = describeSelectionResult(invalidResult);

    setSelectionModeStatus(store, 'error', copy.message, copy.detail, {
      selectedCandidate: null,
      hoverPreview: null
    });
    return null;
  }

  return {
    request,
    viewport: createViewportSnapshot(),
    label: `Region · ${Math.round(bounds.width)}×${Math.round(bounds.height)} px`
  };
}

function installSelectionModeListeners(store: SelectionModeStore): void {
  if (store.listeners) {
    return;
  }

  const listeners = {
    mousemove: (event: MouseEvent) => {
      dismissCoach(store);
      if (!store.active || store.phase !== 'choosing' || store.dragAnchor || store.selectedCandidate) {
        return;
      }
      store.currentMode = 'element';

      if (isSelectionModeUiNode(event.target)) {
        if (store.hoverPreview) {
          store.hoverPreview = null;
          renderSelectionModeUi(store);
        }
        return;
      }

      const element = resolveVisibleSelectionTargetElement(event);
      if (!element) {
        if (store.hoverPreview) {
          store.hoverPreview = null;
          renderSelectionModeUi(store);
        }
        return;
      }

      const description = describeElementCandidate(element);
      store.hoverPreview = {
        rect: element.getBoundingClientRect(),
        label: description.label
      };
      renderSelectionModeUi(store);
    },
    click: (event: MouseEvent) => {
      dismissCoach(store);
      if (!store.active || store.phase === 'submitting' || store.phase === 'completed') {
        return;
      }

      // Above-threshold drag commits via pointerup, then the browser fires a
      // synthetic click on the pointerup target. That click would overwrite
      // the just-committed region with an element selection. The pointerup
      // commit path sets `suppressNextClick = true` so we drop exactly one
      // click event and reset the flag.
      if (store.suppressNextClick) {
        // The trailing-click suppression is meant to swallow the synthetic
        // click that follows a region drag commit, NOT clicks on the
        // toolbar/menu/coach/toast UI. If the click landed on UI, let it
        // through so its own listener can run.
        if (isSelectionModeUiNode(event.target)) {
          store.suppressNextClick = false;
          return;
        }
        store.suppressNextClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      // Outside-click on the overflow menu closes it. The menu lives inside
      // `#pagemint-selection-mode-root` so `isSelectionModeUiNode` would
      // return true; check for menu and toggle button explicitly.
      if (store.overflowMenuOpen
        && !isSelectionModeMenuNode(event.target)
        && !isSelectionModeOverflowToggleNode(event.target)) {
        closeOverflowMenu(store);
        // If the click landed on a non-UI host page node, swallow it so
        // the host doesn't react to an outside-close click.
        if (!isSelectionModeUiNode(event.target)) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      // If a selection is already committed, the user must press Retry (R)
      // to re-select. Stray clicks must not overwrite a deliberate selection.
      if (store.phase === 'selected') {
        return;
      }

      // Clicks on toolbar/menu/coach UI must not flow into the
      // element-selection commit logic — the existing button click handlers
      // own those interactions.
      if (isSelectionModeUiNode(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      // Click without prior drag movement always commits an element selection.
      // (Below-threshold drag clears `dragAnchor` in pointerup; above-threshold
      // is filtered above by `suppressNextClick`.)
      store.currentMode = 'element';

      const element = resolveVisibleSelectionTargetElement(event);
      if (!element) {
        setSelectionModeStatus(
          store,
          'error',
          'Select one fully visible element before export.',
          'Scroll so the element is fully visible, or drag a region instead.',
          {
            selectedCandidate: null,
            hoverPreview: null
          }
        );
        return;
      }

      const candidate = createElementSelectionCandidate(store, element);
      if (!candidate) {
        setSelectionModeStatus(
          store,
          'error',
          'Select one fully visible element before export.',
          'Scroll so the element is fully visible, or drag a region instead.',
          {
            selectedCandidate: null,
            hoverPreview: null
          }
        );
        return;
      }

      setSelectionModeStatus(
        store,
        'selected',
        candidate.label,
        '',
        {
          selectedCandidate: candidate,
          hoverPreview: null
        }
      );
    },
    pointerdown: (event: PointerEvent) => {
      dismissCoach(store);
      if (!store.active || store.phase === 'submitting' || store.phase === 'completed') {
        return;
      }

      if (isSelectionModeUiNode(event.target) || event.button !== 0) {
        return;
      }

      store.suppressNextClick = false;

      event.preventDefault();
      event.stopPropagation();
      store.selectedCandidate = null;
      store.hoverPreview = null;
      store.dragAnchor = {
        x: clampNumber(event.clientX, 0, globalThis.innerWidth),
        y: clampNumber(event.clientY, 0, globalThis.innerHeight)
      };
      store.dragFocus = { ...store.dragAnchor };
    },
    pointermove: (event: PointerEvent) => {
      if (!store.active || !store.dragAnchor || store.phase !== 'choosing') {
        return;
      }

      const dx = event.clientX - store.dragAnchor.x;
      const dy = event.clientY - store.dragAnchor.y;
      const moved = Math.hypot(dx, dy) >= dragIntentThresholdPx;

      if (moved) {
        store.currentMode = 'region';
        setSelectionModeStatus(
          store,
          'choosing',
          drawingRegionMessage,
          '',
          {
            selectedCandidate: null,
            hoverPreview: null
          }
        );
      }

      event.preventDefault();
      event.stopPropagation();
      store.dragFocus = {
        x: clampNumber(event.clientX, 0, globalThis.innerWidth),
        y: clampNumber(event.clientY, 0, globalThis.innerHeight)
      };
      if (store.dimChipElement && store.dragAnchor) {
        const width = Math.abs(store.dragFocus.x - store.dragAnchor.x);
        const height = Math.abs(store.dragFocus.y - store.dragAnchor.y);
        const chipX = clampNumber(event.clientX + 12, 0, globalThis.innerWidth - 80);
        const chipY = clampNumber(event.clientY + 12, 0, globalThis.innerHeight - 30);
        store.dimChipElement.textContent = `${Math.round(width)} × ${Math.round(height)}`;
        store.dimChipElement.style.left = `${chipX}px`;
        store.dimChipElement.style.top = `${chipY}px`;
        store.dimChipElement.style.display = 'block';
      }
      renderSelectionModeUi(store);
    },
    pointerup: (event: PointerEvent) => {
      if (!store.active || !store.dragAnchor || store.phase !== 'choosing') {
        return;
      }

      const dx = event.clientX - store.dragAnchor.x;
      const dy = event.clientY - store.dragAnchor.y;
      const crossedThreshold = Math.hypot(dx, dy) >= dragIntentThresholdPx;

      if (!crossedThreshold) {
        // Pointerdown-up below the intent threshold: treat as click. Clear
        // the drag anchor so the click handler (already in flight from the
        // browser's native sequence) commits an element selection.
        clearDragSelection(store);
        if (store.dimChipElement) {
          store.dimChipElement.style.display = 'none';
        }
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      store.dragFocus = {
        x: clampNumber(event.clientX, 0, globalThis.innerWidth),
        y: clampNumber(event.clientY, 0, globalThis.innerHeight)
      };

      const candidate = createRegionSelectionCandidate(store);
      clearDragSelection(store);
      if (store.dimChipElement) {
        store.dimChipElement.style.display = 'none';
      }

      if (!candidate) {
        // Validation failed (region too small). Don't suppress the trailing
        // click — the user may want to interact with the error toast (e.g.,
        // click "Whole page" or "Try again"), and the document-level click
        // handler in capture phase would otherwise eat that click before
        // the toast button's own listener fires.
        setSelectionModeStatus(
          store,
          'error',
          errorSelectionGenericMessage,
          'Drag a larger region, or capture the whole page instead.',
          {
            selectedCandidate: null,
            hoverPreview: null
          }
        );
        return;
      }

      // Region committed. Suppress the trailing synthetic click so it
      // can't overwrite the region with an element selection.
      store.suppressNextClick = true;

      setSelectionModeStatus(
        store,
        'selected',
        candidate.label,
        '',
        {
          selectedCandidate: candidate,
          hoverPreview: null
        }
      );
    },
    contextmenu: (event: MouseEvent) => {
      if (!store.active || isSelectionModeUiNode(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    },
    keydown: (event: KeyboardEvent) => {
      if (!store.active) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        if (store.overflowMenuOpen) {
          closeOverflowMenu(store);
          return;
        }
        cleanupSelectionModeUi(store);
        return;
      }

      if (event.key === 'Enter' && store.phase === 'selected') {
        event.preventDefault();
        void submitSelectionCandidate(store);
        return;
      }

      if ((event.key === 'r' || event.key === 'R') && (store.phase === 'selected' || store.phase === 'error')) {
        event.preventDefault();
        resetSelectionChoice(store);
        return;
      }

      // v1 maps `?` to the overflow menu — its items already print their
      // shortcuts inline (⇧⌘P, Esc), so the menu serves as the shortcut
      // sheet for v1. A dedicated modal shortcut sheet is deferred.
      if (event.key === '?') {
        if (store.phase === 'submitting' || store.phase === 'completed') {
          return;
        }
        event.preventDefault();
        toggleOverflowMenu(store);
      }
    },
    wheel: (event: WheelEvent) => {
      if (!store.active || !store.dragAnchor) {
        return;
      }
      event.preventDefault();
    },
  } satisfies NonNullable<SelectionModeStore['listeners']>;

  document.addEventListener('mousemove', listeners.mousemove, true);
  document.addEventListener('click', listeners.click, true);
  document.addEventListener('pointerdown', listeners.pointerdown, true);
  document.addEventListener('pointermove', listeners.pointermove, true);
  document.addEventListener('pointerup', listeners.pointerup, true);
  document.addEventListener('contextmenu', listeners.contextmenu, true);
  document.addEventListener('keydown', listeners.keydown, true);
  document.addEventListener('wheel', listeners.wheel, { capture: true, passive: false });
  store.listeners = listeners;
}

export function runSelectionModePageAction(
  action: { kind: 'start'; options: SelectionModeRuntimeOptions } | { kind: 'stop' }
): SelectionModeStartResult {
  const store = getSelectionModeStore();

  if (action.kind === 'stop') {
    cleanupSelectionModeUi(store);
    return {
      ok: true,
      status: 'stopped',
      message: 'Selection mode closed.'
    };
  }

  if (store.active) {
    return {
      ok: true,
      status: 'already-active',
      message: 'Selection mode is already active on this page.'
    };
  }

  ensureSelectionModePresentation(store);
  store.active = true;
  store.options = action.options;
  store.currentMode = 'element';
  store.coachInteractionSeen = false;
  resetSelectionChoice(store);
  installSelectionModeListeners(store);

  void showCoachIfFirstRun(store);

  return {
    ok: true,
    status: 'started',
    message: 'Selection mode is ready on this page.'
  };
}

export function handleSelectionModeTabMessage(message: unknown): SelectionModeStartResult | null {
  if (!isSelectionModeTabMessage(message)) {
    return null;
  }

  if (message.command === 'ping') {
    return {
      ok: true,
      status: 'ready',
      message: 'Selection mode runtime is ready.'
    };
  }

  if (message.command === 'stop') {
    return runSelectionModePageAction({ kind: 'stop' });
  }

  if (!message.options) {
    return {
      ok: false,
      code: 'active-page-unavailable',
      message: 'PageMint could not restore the selection-mode page context.'
    };
  }

  return runSelectionModePageAction({
    kind: 'start',
    options: message.options
  });
}

export function registerSelectionModeTabMessageHandler(
  runtime: SelectionModeRuntimeLike | null = getSelectionModeRuntime()
): void {
  if (!runtime?.onMessage?.addListener) {
    return;
  }

  const globalWithRegistration = globalThis as typeof globalThis & SelectionModeGlobal;

  if (globalWithRegistration.__pagemintSelectionModeListenerRegistered === true) {
    return;
  }

  runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const response = handleSelectionModeTabMessage(message);
    if (!response) {
      return undefined;
    }

    sendResponse(response);
    return true;
  });

  globalWithRegistration.__pagemintSelectionModeListenerRegistered = true;
}

function createSelectionManagedAssetFileName(request: SelectionRequest): string {
  const baseFileName = createExactExportSuggestedFileName(request.selection.target.title).replace(/\.pdf$/iu, '');
  const suffix = request.selection.intent === 'element-selection'
    ? 'element-selection'
    : 'region-selection';
  return `${baseFileName}-${suffix}.pdf`;
}

export async function handleSelectionModeCaptureAndStageMessage(
  message: SelectionModeCaptureAndStageMessage,
  sender: SelectionModeMessageSenderLike,
  tabs: SelectionModeCaptureTabsLike,
  registry: ExactExportStagedSessionRegistry,
  dependencies: SelectionModeBackgroundDependencies = {}
): Promise<SelectionModeCaptureAndStageResponse> {
  const validation = validateSelectionRequest(message.request);

  if (!validation.ok) {
    return {
      ok: true,
      result: createSelectionValidationFailureResult(message.request, validation)
    };
  }

  if (!tabs.captureVisibleTab) {
    return {
      ok: true,
      result: createSelectionRenderFailedOutcome(
        message.request,
        'PageMint could not capture the visible browser surface for this selection.'
      )
    };
  }

  try {
    const captureDataUrl = await tabs.captureVisibleTab(sender.tab?.windowId, {
      format: 'jpeg',
      quality: 92
    });
    const renderSelectionCapture = dependencies.renderSelectionCapture ?? renderSelectionCaptureToPdfBase64;
    const pdfBase64 = await renderSelectionCapture(
      captureDataUrl,
      message.request.selection.boundary.bounds,
      message.viewport
    );
    const managedAsset = createManagedPdfAssetOutcome(message.pageRequest, {
      fileName: createSelectionManagedAssetFileName(message.request),
      knownLimitationsSummary: []
    });
    const result = createSelectionConfirmedOutcome(message.request, managedAsset);
    const session = await registry.stageManagedPdfAssetSession(
      message.pageRequest,
      managedAsset,
      pdfBase64,
      message.preferredManagedDelivery,
      {
        canRerunBrowserPrint: false,
        knownLimitations: []
      }
    );

    return {
      ok: true,
      result,
      session
    };
  } catch (error) {
    errorRing.push({
      ts: Date.now(),
      kind: 'selection_stage_failed',
      message: error instanceof Error ? error.message : String(error),
      stackHead: error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : undefined
    });
    return {
      ok: true,
      result: createSelectionRenderFailedOutcome(
        message.request,
        normalizeExtensionErrorMessage(error) || 'PageMint could not stage the selected boundary as a managed PDF asset.'
      )
    };
  }
}

export function registerSelectionModeBackgroundHandler(
  runtime: SelectionModeBackgroundRuntimeLike,
  tabs: SelectionModeCaptureTabsLike,
  registry: ExactExportStagedSessionRegistry,
  dependencies: SelectionModeBackgroundDependencies = {}
): void {
  runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isSelectionModeCaptureAndStageMessage(message)) {
      return undefined;
    }

    void handleSelectionModeCaptureAndStageMessage(message, sender, tabs, registry, dependencies).then(sendResponse);
    return true;
  });
}
