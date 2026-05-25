import { localOnlyBoundarySummary, localOnlyDataSummary } from './site-policy';

export type PermissionCopy = {
  permission: string;
  title: string;
  body: string;
};

export const trustHeroLead =
  'PageMint is a local browser extension. It declares activeTab, scripting, storage, debugger, and downloads so the browser can capture the page you asked for, render local PDFs, remember local preferences, and save files when you explicitly request it.';

export const baselinePermissions = [
  {
    permission: 'activeTab',
    title: 'Use the tab you asked for',
    body: 'PageMint acts only on the page you clicked from. It does not monitor other tabs or websites.'
  },
  {
    permission: 'scripting',
    title: 'Prepare that one tab',
    body: 'PageMint runs local helper code in the active tab to prepare the page for export after your click.'
  },
  {
    permission: 'storage',
    title: 'Remember local settings',
    body: 'Paper size, margins, theme, High Fidelity preference, output-folder state, and optional local history are stored in this browser profile.'
  },
  {
    permission: 'downloads',
    title: 'Save files you request',
    body: 'PageMint uses browser downloads only for user-triggered managed PDF saves.'
  }
] satisfies PermissionCopy[];

export const highFidelityInstallPermission: PermissionCopy = {
  permission: 'debugger',
  title: "Use Chrome's local renderer",
  body: 'Chrome requires the debugger permission at install time. PageMint attaches it only during a High Fidelity run and detaches when the local render finishes.'
};

export const highFidelityFacts = [
  'High Fidelity is local.',
  'PageMint does not contact a hosted renderer before running High Fidelity.',
  'Chrome shows its debugging banner while the local renderer is attached.'
] satisfies string[];

export const localFirstFacts = [
  localOnlyDataSummary,
  localOnlyBoundarySummary,
  "The browser-print path hands off to Chrome's print dialog.",
  'The managed-PDF path writes through local browser save or download APIs.',
  'Removing PageMint from the browser removes its extension-local settings and history state.'
] satisfies string[];

export const trustGuardrails = [
  'No backend host permission is shipped in the extension manifest.',
  'No account, telemetry, or private support endpoint is called by the extension.',
  'No page HTML, page text, screenshots, or exported PDFs are uploaded to PageMint.',
  'Public support happens through GitHub issues; private content should stay out of issue reports.',
  'The source code and MIT license are public so the runtime boundary can be inspected.'
] satisfies string[];
