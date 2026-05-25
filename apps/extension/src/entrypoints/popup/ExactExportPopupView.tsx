import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';

import type {
  ExactExportConfig,
  ExactExportContentScopeMode,
  ExactExportLayout,
  ExactExportMarginId,
  ExactExportNumericConstraint,
  ExportCaptureModeId
} from '@pagemint/shared-types';

import { PmSelect } from '../../components/pm-select';
import { ThemeToggle } from '../../components/theme-toggle';
import {
  applyAppearanceThemeToDocument,
  defaultAppearanceTheme,
  loadAppearanceTheme,
  saveAppearanceTheme,
  type AppearanceTheme
} from '../../lib/appearance-theme';
import { articleSubModeOptions, captureModeOptions, type ArticleSubMode, type CaptureMode } from '../../lib/capture-mode';
import type {
  ExactExportPopupSettingsState,
  ExactExportPopupState
} from '../../lib/exact-export-popup';
import { resolveExactExportPopupRuntimeForTab } from '../../lib/exact-export-popup-settings';
import { getSpecializedSurfacePresetLabel } from '../../lib/specialized-surface';

export interface ActiveTabInfo {
  title: string;
  host: string;
  favIconUrl: string | null;
}

export interface ExactExportPopupViewProps {
  popupState: ExactExportPopupState;
  settingsState: ExactExportPopupSettingsState;
  activeTab: ActiveTabInfo | null;
  currentTabUrl?: string;
  onExport: () => void;
  onRemoveElements?: () => void;
  onCaptureModeChange?: (nextCaptureMode: ExportCaptureModeId) => void;
  onCaptureModeChoiceChange?: (nextChoice: CaptureMode) => void;
  onArticlePreferredSubModeChange?: (nextSubMode: ArticleSubMode) => void;
  onSettingsChange: (nextSettings: ExactExportConfig) => void;
  onScopeChange?: (nextMode: ExactExportContentScopeMode) => void;
  onLayoutChange?: (next: ExactExportLayout) => void;
  onHighFidelityToggle?: (enabled: boolean) => void;
  onEnableHighFidelity?: () => void;
  onSecondaryAction?: () => void;
  onDismissCallout?: () => void;
  onOpenOptions?: () => void;
  onOpenSiteSpecificSettings?: () => void;
  onDismissSiteSpecificMigrationNotice?: () => void;
  removeElementsBusy?: boolean;
  removeElementsError?: string | null;
  highFidelityBusy?: boolean;
  highFidelityError?: string | null;
  defaultDrawerOpen?: boolean;
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path d="M8 2.5v8M4.5 7l3.5 3.5L11.5 7M3 13h10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M4 10.5 8 14.5 16 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="10" cy="10" r="8" />
      <path d="M10 6v4M10 13.5v.01" strokeLinecap="round" />
    </svg>
  );
}

function LinkIcon({ linked }: { linked: boolean }) {
  return linked ? (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path d="M6.5 9.5 9.5 6.5" strokeLinecap="round" />
      <path d="M9 4.5 10.5 3a2.5 2.5 0 0 1 3.5 3.5L12.5 8" strokeLinecap="round" />
      <path d="M7 12 5.5 13.5A2.5 2.5 0 0 1 2 10L3.5 8.5" strokeLinecap="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path d="M9 5 10.5 3.5A2.5 2.5 0 0 1 14 7L12.5 8.5" strokeLinecap="round" />
      <path d="M7 11 5.5 12.5A2.5 2.5 0 0 1 2 9L3.5 7.5" strokeLinecap="round" />
      <path d="M2 14 14 2" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

export type CaptureChoice = ExactExportContentScopeMode | 'selection';

export interface CaptureChoiceHandlerCallbacks {
  onCaptureModeChange?: (nextCaptureMode: ExportCaptureModeId) => void;
  onScopeChange?: (nextMode: ExactExportContentScopeMode) => void;
}

export function createCaptureChoiceHandler(
  callbacks: CaptureChoiceHandlerCallbacks
): (next: CaptureChoice) => void {
  return (next) => {
    if (next === 'selection') {
      callbacks.onCaptureModeChange?.('selection');
    } else {
      callbacks.onScopeChange?.(next);
    }
  };
}

function clampMargin(value: number, schema: ExactExportNumericConstraint): number {
  if (Number.isNaN(value)) return schema.defaultValue;
  return Math.min(schema.max, Math.max(schema.min, value));
}

function roundMargin(value: number): number {
  return Math.round(value * 100) / 100;
}

interface MarginScrubFieldProps {
  marginId: ExactExportMarginId;
  value: number;
  schema: ExactExportNumericConstraint;
  disabled: boolean;
  onChange: (next: number) => void;
}

function MarginScrubField({ marginId, value, schema, disabled, onChange }: MarginScrubFieldProps) {
  const startRef = useRef<{ x: number; value: number; step: number } | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  const handlePointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    const fineStep = event.shiftKey ? 0.01 : event.altKey ? schema.step : 0.05;
    startRef.current = { x: event.clientX, value, step: fineStep };
    setScrubbing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const start = startRef.current;
    if (!start) return;
    const pixelsPerStep = 6;
    const delta = Math.round((event.clientX - start.x) / pixelsPerStep) * start.step;
    const next = roundMargin(clampMargin(start.value + delta, schema));
    if (next !== value) onChange(next);
  };

  const endScrub = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!startRef.current) return;
    startRef.current = null;
    setScrubbing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLInputElement>) => {
    if (disabled || document.activeElement !== event.currentTarget) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.01 : event.altKey ? schema.step : 0.05;
    const direction = event.deltaY < 0 ? 1 : -1;
    onChange(roundMargin(clampMargin(value + direction * step, schema)));
  };

  return (
    <label className={`pm-drawer-margin${scrubbing ? ' pm-drawer-margin--scrubbing' : ''}`} htmlFor={`pm-margin-${marginId}`} title={`${marginId} margin — drag label to scrub, Shift = fine, Alt = step`}>
      <span
        className="pm-drawer-margin-lab"
        role="slider"
        tabIndex={-1}
        aria-label={`${marginId} margin scrub`}
        aria-valuemin={schema.min}
        aria-valuemax={schema.max}
        aria-valuenow={value}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
      >
        {marginId[0]?.toUpperCase()}
      </span>
      <input
        id={`pm-margin-${marginId}`}
        className="pm-drawer-margin-input"
        type="number"
        inputMode="decimal"
        min={schema.min}
        max={schema.max}
        step={schema.step}
        value={String(value)}
        disabled={disabled}
        onWheel={handleWheel}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const parsed = Number(event.currentTarget.value);
          onChange(Number.isNaN(parsed) ? value : parsed);
        }}
      />
    </label>
  );
}

export function ExactExportPopupView({
  popupState,
  settingsState,
  currentTabUrl = '',
  onExport,
  onRemoveElements,
  onCaptureModeChange,
  onCaptureModeChoiceChange,
  onArticlePreferredSubModeChange,
  onSettingsChange,
  onScopeChange,
  onLayoutChange,
  onHighFidelityToggle,
  onEnableHighFidelity,
  onSecondaryAction,
  onDismissCallout,
  onOpenOptions,
  onOpenSiteSpecificSettings,
  onDismissSiteSpecificMigrationNotice,
  removeElementsBusy = false,
  removeElementsError = null,
  highFidelityBusy = false,
  highFidelityError = null,
  defaultDrawerOpen = false
}: ExactExportPopupViewProps) {
  const [drawerOpen, setDrawerOpen] = useState(defaultDrawerOpen);
  const [marginsLinked, setMarginsLinked] = useState(false);
  const [appearanceTheme, setAppearanceTheme] = useState<AppearanceTheme>(defaultAppearanceTheme);

  useEffect(() => {
    let isMounted = true;
    void loadAppearanceTheme().then((theme) => {
      if (!isMounted) return;
      setAppearanceTheme(theme);
      applyAppearanceThemeToDocument(theme);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setAppearanceTheme(settingsState.appearanceTheme);
    applyAppearanceThemeToDocument(settingsState.appearanceTheme);
  }, [settingsState.appearanceTheme]);

  const handleThemeCycle = (nextTheme: AppearanceTheme) => {
    setAppearanceTheme(nextTheme);
    applyAppearanceThemeToDocument(nextTheme);
    void saveAppearanceTheme(nextTheme).catch(() => undefined);
  };

  const { config, schema } = settingsState;
  const hfEnabled = settingsState.highFidelityRenderingStatus === 'enabled';
  const marginIds = Object.keys(schema.marginsInInches) as ExactExportMarginId[];
  const isSoftFailure = popupState.failure?.code === 'content-scope-unavailable';

  // Compute capture runtime decision from the active tab URL. This is a pure function —
  // cheap to call each render. The popup view consumes notices from the decision rather
  // than duplicating route-matching logic in JSX. We index by id so each render slot stays
  // visually anchored where the user expects it (next to the relevant control) while still
  // sharing one source of truth for the gate conditions.
  const runtimeDecision = resolveExactExportPopupRuntimeForTab(settingsState, currentTabUrl);
  const noticeById = (id: 'article-hf-fallback' | 'continuous-hf-required' | 'clean-paginated-only' | 'site-specific-active' | 'site-specific-fallback' | 'site-specific-paginated-only') =>
    runtimeDecision.notices.find((notice) => notice.id === id);
  const articleHfFallbackNotice = noticeById('article-hf-fallback');
  const continuousHfRequiredNotice = noticeById('continuous-hf-required');
  const cleanPaginatedOnlyNotice = noticeById('clean-paginated-only');
  const siteSpecificNotices = runtimeDecision.notices.filter(
    (n) => n.id === 'site-specific-active' || n.id === 'site-specific-fallback' || n.id === 'site-specific-paginated-only'
  );

  // Migration toast: show once when user had a specialized preset and notice not yet dismissed.
  const showMigrationToast =
    settingsState.siteSpecificDefault !== null &&
    !settingsState.siteSpecificMigrationNoticeDismissed;
  const migrationAdapterLabel = settingsState.siteSpecificDefault
    ? getSpecializedSurfacePresetLabel(settingsState.siteSpecificDefault)
    : '';

  const phase = popupState.phase;
  const isPending = phase === 'pending';
  const isIdle = phase === 'idle';
  const headline = popupState.headline;
  const subcopy = popupState.message;
  const primaryLabel = popupState.actionLabel;
  const fileName = popupState.fileName;
  const primaryDisabled = isPending || popupState.isActionDisabled;
  const showRemoveElementsAction = phase === 'idle' && !isSoftFailure && popupState.failure?.code !== 'unsupported-page';

  const newCaptureModeOptions: ReadonlyArray<{ value: CaptureMode; label: string }> =
    captureModeOptions.map((opt) => ({ value: opt.id, label: opt.label }));

  const handleCaptureModeChoiceChange = (next: CaptureMode) => {
    onCaptureModeChoiceChange?.(next);
  };

  const stateTone =
    phase === 'succeeded' ? 'success' :
    phase === 'failed' ? 'failure' :
    phase === 'pending' ? 'pending' : 'idle';

  return (
    <main className="pm-shell" aria-label="PageMint PDF export">
      <div className="pm-scroll">
        <header className="pm-head">
          <span className="pm-wordmark" aria-label="PageMint">
            <span className="pm-wordmark-p" aria-hidden="true">P</span>
            <span className="pm-wordmark-name" aria-hidden="true">ageMint</span>
            <span className="pm-wordmark-dot" aria-hidden="true" />
          </span>
          <div className="pm-head-actions">
            {hfEnabled ? (
              <span className="pm-mode-pill" title="High-fidelity mode is on">HF</span>
            ) : null}
            <ThemeToggle theme={appearanceTheme} onCycle={handleThemeCycle} />
          </div>
        </header>

        <section className={`pm-state pm-state--${stateTone}`} aria-live="polite">
          <div className="pm-state-icon" aria-hidden="true">
            {phase === 'pending' ? <span className="pm-spinner" /> : null}
            {phase === 'succeeded' ? <CheckIcon /> : null}
            {phase === 'failed' ? <AlertIcon /> : null}
          </div>
          <h1 className="pm-state-title">{headline}</h1>
          {fileName && phase === 'succeeded' ? (
            <p className="pm-state-filename" title={fileName}>{fileName}</p>
          ) : null}
          {popupState.meta ? (
            <p className="pm-state-meta">{popupState.meta}</p>
          ) : null}
          {subcopy ? <p className="pm-state-sub">{subcopy}</p> : null}
          {popupState.detail ? (
            <p className="pm-state-detail">{popupState.detail}</p>
          ) : null}
        </section>

        {showRemoveElementsAction ? (
          <div className="pm-scope-row">
            <span className="pm-scope-label" id="pm-scope-row-label">Capture</span>
            <PmSelect<CaptureMode>
              id="pm-scope-row-select"
              ariaLabelledBy="pm-scope-row-label"
              value={settingsState.captureModeChoice}
              options={newCaptureModeOptions}
              disabled={isPending}
              size="compact"
              onChange={handleCaptureModeChoiceChange}
            />
          </div>
        ) : null}

        {settingsState.captureModeChoice === 'article' ? (
          <div className="pm-popup-article-mode">
            <span className="pm-popup-section-label">Article mode</span>
            <div role="radiogroup" aria-label="Article sub-mode" className="pm-popup-segmented">
              {articleSubModeOptions.map((opt) => {
                const disabled = opt.requiresHighFidelity && settingsState.highFidelityRenderingStatus !== 'enabled';
                const selected = settingsState.articlePreferredSubMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-disabled={disabled || undefined}
                    data-sub-mode={opt.id}
                    data-selected={selected || undefined}
                    data-disabled={disabled || undefined}
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) return;
                      onArticlePreferredSubModeChange?.(opt.id);
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {articleHfFallbackNotice ? (
              <p className="pm-popup-notice pm-popup-notice--warning" role="status">
                {articleHfFallbackNotice.message}{' '}
                <button type="button" className="pm-popup-link" onClick={onEnableHighFidelity}>
                  Enable HF
                </button>
              </p>
            ) : null}
          </div>
        ) : null}

        {siteSpecificNotices.map((notice) => (
          <p
            key={notice.id}
            className={notice.tone === 'success' ? 'pm-popup-notice pm-popup-notice--success' : 'pm-popup-notice pm-popup-notice--warning'}
            role="status"
          >
            {notice.message}
            {notice.id === 'site-specific-fallback' && (
              <>
                {' '}
                <button type="button" className="pm-popup-link" onClick={onOpenSiteSpecificSettings}>
                  Change default
                </button>
              </>
            )}
          </p>
        ))}

        {showMigrationToast ? (
          <p className="pm-popup-notice pm-popup-notice--warning" role="status">
            Site-specific adapters now live in Settings. Your {migrationAdapterLabel} adapter is still on for supported matching pages.{' '}
            <button type="button" className="pm-popup-link" onClick={onDismissSiteSpecificMigrationNotice}>
              Got it
            </button>
          </p>
        ) : null}

        <div className={`pm-actions${isSoftFailure ? ' pm-actions--dual' : ''}`}>
          <button
            type="button"
            className="pm-primary"
            disabled={primaryDisabled}
            onClick={onExport}
          >
            <span className="pm-primary-icon" aria-hidden="true"><DownloadIcon /></span>
            <span className="pm-primary-label">{primaryLabel}</span>
          </button>
          {isSoftFailure ? (
            <button
              type="button"
              className="pm-secondary"
              disabled={isPending}
              onClick={onSecondaryAction}
            >
              {popupState.secondaryActionLabel ?? 'Cancel'}
            </button>
          ) : (
            <button
              type="button"
              className={`pm-gear ${drawerOpen ? 'pm-gear--open' : ''}`}
              onClick={() => setDrawerOpen((open) => !open)}
              aria-expanded={drawerOpen}
              aria-label={drawerOpen ? 'Close export settings' : 'Open export settings'}
              disabled={isPending}
            >
              <GearIcon />
            </button>
          )}
        </div>

        {showRemoveElementsAction ? (
          <div className="pm-tool-row pm-tool-row--single">
            <button
              type="button"
              className="pm-tool-button"
              onClick={onRemoveElements}
              disabled={primaryDisabled || removeElementsBusy}
            >
              {removeElementsBusy ? 'Starting remove mode…' : 'Remove elements on page'}
            </button>
          </div>
        ) : null}

        {removeElementsError ? (
          <p className="pm-tool-error" role="status">
            {removeElementsError}
          </p>
        ) : null}

        {popupState.callout ? (
          <div className="pm-callout" role="status" aria-live="polite">
            <span>{popupState.callout.message}</span>
            <button type="button" className="pm-callout-dismiss" onClick={onDismissCallout} aria-label="Dismiss PageMint callout">
              Dismiss
            </button>
          </div>
        ) : null}

        {drawerOpen && !isSoftFailure ? (
          <div className="pm-drawer" role="group" aria-label="Export settings">
            <div className="pm-drawer-hf">
              <label className="pm-drawer-hf-row" htmlFor="pm-drawer-hf-toggle">
                <span className="pm-drawer-hf-text">
                  <span className="pm-drawer-hf-title">High-fidelity mode</span>
                  <span className="pm-drawer-hf-hint">
                    {settingsState.highFidelityRenderingStatus === 'off'
                      ? 'Chrome removed the debugger permission. Reinstall or re-enable the extension to restore high-fidelity.'
                      : hfEnabled
                        ? 'Attaches Chrome debugger for exact render. Saves locally.'
                        : 'Turn on to attach Chrome debugger for exact render.'}
                  </span>
                </span>
                <input
                  id="pm-drawer-hf-toggle"
                  className="pm-drawer-hf-switch"
                  type="checkbox"
                  role="switch"
                  checked={hfEnabled}
                  disabled={isPending || highFidelityBusy || settingsState.highFidelityRenderingStatus === 'off'}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    onHighFidelityToggle?.(event.currentTarget.checked)
                  }
                />
              </label>
              {highFidelityError ? (
                <p className="pm-drawer-hf-error" role="status" aria-live="polite">
                  {highFidelityError}
                </p>
              ) : null}
            </div>
            <div className="pm-drawer-row">
              <span className="pm-drawer-lab" id="pm-drawer-lab-paper">Paper</span>
              <PmSelect<ExactExportConfig['pageSize']>
                id="pm-drawer-paper"
                ariaLabelledBy="pm-drawer-lab-paper"
                value={config.pageSize}
                options={schema.pageSize}
                disabled={isPending}
                size="compact"
                onChange={(next) => onSettingsChange({ ...config, pageSize: next })}
              />
            </div>
            <div className="pm-drawer-row">
              <span className="pm-drawer-lab" id="pm-drawer-lab-orientation">Orientation</span>
              <PmSelect<ExactExportConfig['orientation']>
                id="pm-drawer-orientation"
                ariaLabelledBy="pm-drawer-lab-orientation"
                value={config.orientation}
                options={schema.orientation}
                disabled={isPending}
                size="compact"
                onChange={(next) => onSettingsChange({ ...config, orientation: next })}
              />
            </div>
            <div className="pm-drawer-row">
              <span className="pm-drawer-lab" id="pm-drawer-lab-scale">Scale</span>
              <PmSelect<ExactExportConfig['scalePercent']>
                id="pm-drawer-scale"
                ariaLabelledBy="pm-drawer-lab-scale"
                value={config.scalePercent}
                options={schema.scalePercent}
                disabled={isPending}
                size="compact"
                onChange={(next) => onSettingsChange({ ...config, scalePercent: next })}
              />
            </div>
            <div className="pm-drawer-row pm-drawer-row--margins">
              <span className="pm-drawer-lab pm-drawer-lab--margins">
                Margins (in)
                <button
                  type="button"
                  className={`pm-drawer-link${marginsLinked ? ' pm-drawer-link--on' : ''}`}
                  onClick={() => setMarginsLinked((linked) => !linked)}
                  aria-pressed={marginsLinked}
                  aria-label={marginsLinked ? 'Unlink margins' : 'Link margins (move all together)'}
                  title={marginsLinked ? 'Margins linked — all change together' : 'Link margins to change all together'}
                  disabled={isPending}
                >
                  <LinkIcon linked={marginsLinked} />
                </button>
              </span>
              <div className="pm-drawer-margins">
                {marginIds.map((marginId) => {
                  const marginSchema = schema.marginsInInches[marginId];
                  return (
                    <MarginScrubField
                      key={marginId}
                      marginId={marginId}
                      schema={marginSchema}
                      value={config.marginsInInches[marginId]}
                      disabled={isPending}
                      onChange={(next) => {
                        if (marginsLinked) {
                          onSettingsChange({
                            ...config,
                            marginsInInches: marginIds.reduce(
                              (acc, id) => ({ ...acc, [id]: next }),
                              { ...config.marginsInInches }
                            )
                          });
                        } else {
                          onSettingsChange({
                            ...config,
                            marginsInInches: {
                              ...config.marginsInInches,
                              [marginId]: next
                            }
                          });
                        }
                      }}
                    />
                  );
                })}
              </div>
            </div>
            <label className="pm-popup-output-row">
              <input
                type="checkbox"
                checked={settingsState.config.layout === 'paginated'}
                disabled={settingsState.highFidelityRenderingStatus !== 'enabled'}
                onChange={(e) => onLayoutChange?.(e.target.checked ? 'paginated' : 'long-page')}
              />
              <span>Multi-page PDF</span>
            </label>
            {continuousHfRequiredNotice ? (
              <p className="pm-popup-notice pm-popup-notice--warning" role="status">
                {continuousHfRequiredNotice.message}{' '}
                <button type="button" className="pm-popup-link" onClick={onEnableHighFidelity}>
                  Enable HF
                </button>
              </p>
            ) : null}
            {cleanPaginatedOnlyNotice ? (
              <p className="pm-popup-notice pm-popup-notice--warning" role="status">
                {cleanPaginatedOnlyNotice.message}
              </p>
            ) : null}
            <label className="pm-drawer-check">
              <input
                type="checkbox"
                checked={Boolean(config.includeBackgroundGraphics)}
                disabled={isPending}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  onSettingsChange({
                    ...config,
                    includeBackgroundGraphics: event.currentTarget.checked
                  })
                }
              />
              <span>Include background graphics</span>
            </label>
          </div>
        ) : null}

        <footer className="pm-foot">
          <div className="pm-foot-links">
            <button type="button" className="pm-foot-btn" onClick={onOpenOptions}>
              Settings
            </button>
          </div>
        </footer>
      </div>

      {isIdle ? null : <span className="pm-sr-only">{popupState.message}</span>}
    </main>
  );
}
