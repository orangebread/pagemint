import type { ExactExportPopupSettingsState } from './exact-export-popup';

export function getPermissionsPrivacyOwnershipCopy(settingsState: ExactExportPopupSettingsState): string {
  return settingsState.highFidelityRenderingStatus === 'enabled'
    ? 'With high-fidelity rendering on, PageMint keeps the run local, renders through Chrome DevTools Protocol, writes the PDF locally through the selected delivery path, and detaches the debugger session when finished.'
    : 'PageMint improves the tab before handoff, but Chrome still owns the final print preview, background-graphics toggle, page breaks, and PDF save step.';
}

export function getPermissionsPrivacyDeliveryCopy(settingsState: ExactExportPopupSettingsState): string {
  return settingsState.highFidelityRenderingStatus === 'enabled'
    ? settingsState.highFidelityAutosaveEnabled
      ? settingsState.highFidelityOutputFolder.configured
        ? 'Enabled high-fidelity autosave still stays browser-local and writes into the output folder you chose in Settings.'
        : 'Enabled high-fidelity autosave still stays browser-local and will ask where to save each PDF until you choose an output folder in Settings.'
      : 'Enabled high-fidelity rendering still stays browser-local, but delivery changes to a PageMint-triggered browser download instead of Chrome’s print dialog.'
    : 'The default path stays browser-local and ends in Chrome’s print dialog. No hosted rendering, no silent downloads, no broader permissions.';
}
