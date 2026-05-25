# High-Fidelity Autosave and Output Folder

## Objective Restatement

Reduce save friction on PageMint-owned PDFs by adding high-fidelity autosave and an optional output-folder setting, without pretending the browser-print path can autosave or write arbitrary files.

## Assumptions

- Current implementation is the authority baseline for this spec.
- `debugger` is already install-declared and high-fidelity use is gated by saved toggle state, not runtime permission prompts.
- The saved high-fidelity preference currently defaults to enabled for new installs, so autosave must be explicit and separate from that toggle.
- Browser-print remains unchanged. Chrome still owns the final save step on that path.
- No cloud storage, sync, or account-backed file management is in scope.
- The only PageMint-owned PDF asset path today is `cdp-high-fidelity`.
- Chrome extension pages can use File System Access APIs under user activation, but implementation must still validate the exact MV3 context wiring before shipping.
- Brave is a known support boundary for this slice because it disables the File System Access API by default. Chrome is the current support baseline for persistent output-folder autosave; Edge remains a candidate until the Firefox/Edge support audit proves extension packaging, store policy, File System Access behavior, and high-fidelity mode end to end.

## Behavior Model

### User-facing behavior

The high-fidelity settings surface gains two new controls:

1. `Autosave high-fidelity exports`
2. `Output folder`

Rules:

- Autosave applies only to high-fidelity exports.
- Output folder is optional.
- If autosave is off, high-fidelity keeps the current browser-local download behavior.
- If autosave is on and an output folder is set, the high-fidelity export saves there silently.
- If autosave is on and no output folder is set, PageMint prompts the user where to save that export.
- The popup shows a note whenever autosave is enabled, with a Settings affordance.

Required popup note behavior:

- autosave on + folder set:
  - `Autosave is on for high-fidelity exports. Output folder set in Settings.`
- autosave on + no folder set:
  - `Autosave is on for high-fidelity exports. If no output folder is set, PageMint will ask where to save this PDF.`

The note must include a `Settings` action or equivalent direct affordance.

### Browser support boundary

- `Choose output folder` is a supported baseline on browsers where File System Access APIs are available by default in extension pages.
- Chrome is the primary supported browser for persistent output-folder autosave today. Treat Edge as a candidate browser until browser-support follow-up work proves the extension, File System Access, and store-publication path separately.
- Chromium blocks top-level Downloads, Desktop, Documents, home, system, app, and browser-data folders for File System Access. Users must choose or create a dedicated non-sensitive subfolder, such as Downloads/PageMint.
- Brave should not be presented as fully equivalent here. If Brave blocks the picker surface, the UI should disable folder selection, prevent enabling autosave, and optionally offer Brave-specific troubleshooting copy that points advanced users to Brave's File System Access flag.

### Delivery matrix

| Path | Autosave | Output folder | Result |
|---|---|---|---|
| browser-print | any | any | unchanged Chrome print dialog |
| cdp-high-fidelity | off | any | current browser-local download |
| cdp-high-fidelity | on | configured | silent save to configured folder |
| cdp-high-fidelity | on | not configured | save-location prompt for that export |

### Runtime flow

#### High-fidelity + autosave off

1. run current CDP render flow
2. receive PDF bytes
3. deliver via current browser-local download behavior

#### High-fidelity + autosave on + no output folder

1. user clicks export
2. PageMint opens `showSaveFilePicker()` immediately while user activation is still valid
3. if the user cancels, the run aborts cleanly and no CDP render starts
4. if the user picks a destination, PageMint runs the CDP render
5. PageMint writes the PDF to the chosen file handle

#### High-fidelity + autosave on + output folder configured

1. user clicks export
2. PageMint checks write access on the stored `FileSystemDirectoryHandle`
3. if access is valid, PageMint runs the CDP render
4. PageMint creates a unique file name in that directory and writes the PDF there
5. if access is stale or denied, the run fails honestly and sends the user back to Settings to re-select the folder

### Edge cases

- save-location prompt cancelled: no render, no partial success, no fake failure copy
- output-folder handle stale: do not silently dump to Downloads; fail honestly
- output-folder permission denied: tell the user to re-select the folder in Settings
- restricted top-level or sensitive folder selected: the browser rejects it; direct the user to choose or create a dedicated non-sensitive subfolder, such as Downloads/PageMint
- file already exists in output folder: uniquify; do not overwrite silently
- folder summary in UI: show the folder name only, not a full filesystem path we may not have or should not claim
- service-worker restart: persisted folder handle may survive via IndexedDB, but the UI must still re-check permission state before calling the run silent

## State Model

### Shared result contract

The current `local-download` delivery metadata is too coarse for this feature. Shared contracts must distinguish the managed-PDF delivery method from the rendering path.

Recommended additions:

```ts
type ExactExportManagedPdfDeliveryMethod =
  | 'browser-download'
  | 'save-picker'
  | 'output-folder';
```

High-fidelity success and planned-delivery metadata should carry:

```ts
{
  renderingPath: 'cdp-high-fidelity';
  method: 'browser-download' | 'save-picker' | 'output-folder';
  suggestedFileName: string;
  status: 'planned' | 'saved';
  completion: 'local-save-pending' | 'saved-locally';
}
```

Browser-print stays separate and unchanged.

### Shared failure contract

Add explicit failure codes for local file delivery:

```ts
type ExactExportHighFidelityFailureCode =
  | 'cdp-attach-failed'
  | 'cdp-print-failed'
  | 'cdp-permission-revoked'
  | 'save-picker-cancelled'
  | 'save-picker-write-failed'
  | 'output-folder-permission-denied'
  | 'output-folder-write-failed'
  | 'file-system-access-unavailable';
```

Invariant:

- `save-picker-cancelled` is user intent, not an infrastructure defect. The popup copy should treat it as a clean abort, not as a scary runtime failure.

### Extension-local persisted state

These settings belong to the extension surface, not to shared exact-export rendering config:

```ts
{
  highFidelityMode: boolean;
  highFidelityAutosaveEnabled: boolean;
}
```

Add a separate extension-local summary for folder state, stored in browser storage for cheap UI reads:

```ts
{
  outputFolderConfigured: boolean;
  outputFolderName?: string;
}
```

The actual `FileSystemDirectoryHandle` must live in IndexedDB, not in the shared rendering contract.

## Proposed Design

### 1. Shared delivery contract and filename rules

Ownership: `core`

- extend success and planned-delivery metadata so high-fidelity runs report `browser-download`, `save-picker`, or `output-folder`
- add failure codes and message mapping hooks for save-picker and output-folder failures
- add a deterministic filename uniquify helper for directory writes
- keep browser-print contracts unchanged

### 2. Settings surface

Ownership: `extension`

- add `Autosave high-fidelity exports` to Options
- add `Output folder` row with `Choose folder`, `Change`, and `Clear`
- make folder selection optional
- show summary text:
  - `No output folder set. PageMint will ask where to save each autosaved PDF.`
  - `Output folder set. Future high-fidelity autosaves go there automatically.`

### 3. Popup note and copy

Ownership: `extension`

- show an idle-state note whenever high-fidelity autosave is enabled
- include a `Settings` action
- update success copy to be delivery-method-specific:
  - `Downloaded locally`
  - `Saved to chosen location`
  - `Saved to output folder`
- update failure copy to be delivery-method-specific:
  - `Save location wasn’t chosen`
  - `Couldn’t write the PDF to the selected file`
  - `Couldn’t access the output folder`

### 4. Save-picker flow

Ownership: `extension`

- trigger `showSaveFilePicker()` from the export click path before long async work begins
- if the picker is cancelled, stop before CDP render starts
- write PDF bytes directly to the returned `FileSystemFileHandle`
- do not silently convert the chosen location into the default output folder

### 5. Output-folder flow

Ownership: `extension`

- trigger `showDirectoryPicker({ mode: 'readwrite' })` from Settings only
- store the returned handle in IndexedDB and persist a lightweight summary in browser storage
- verify `readwrite` permission before silent folder writes
- on stale permission or missing handle, fail honestly and direct the user back to Settings
- create a unique file name inside the selected directory before writing

### 6. Delivery-method routing

Ownership: `extension`

High-fidelity delivery should resolve like this:

1. `autosave off` -> `browser-download`
2. `autosave on + no folder` -> `save-picker`
3. `autosave on + folder configured` -> `output-folder`

This routing happens only after the run is already committed to `cdp-high-fidelity`. Browser-print never uses these branches.

## Risks and Failure Modes

- user-activation loss can make `showSaveFilePicker()` fail if the picker is opened after long async work starts
- stale or denied folder handles can leave autosave enabled but not operational
- treating picker cancellation as a normal error will create noisy, misleading UX
- storing output-folder state in shared rendering config would leak extension-only implementation detail across the wrong boundary
- silent overwrite is operationally reckless

## Alternatives and Tradeoffs

### Alternative A: Require output folder before autosave can be enabled

Pros:

- simpler silent-write model
- less runtime branching

Cons:

- higher setup friction
- contradicts the agreed product direction

Decision: reject.

### Alternative B: Use `chrome.downloads` with custom filenames

Pros:

- stays inside extension APIs

Cons:

- cannot write to arbitrary directories
- still collapses all high-fidelity saves into the browser downloads location

Decision: reject.

### Alternative C: Always prompt with a save picker when autosave is on

Pros:

- no stored directory-handle complexity

Cons:

- not actually autosave
- defeats the main workflow gain

Decision: reject.

## Critical Review

The weak point in this design is not the UI. It is the cross-context file-write path. If the extension cannot cleanly persist and reuse file-system handles across popup, Options, and service-worker contexts, the feature becomes a pile of edge-case copy around a brittle write path.

That risk does not invalidate the product decision. It changes implementation order:

- prove the handle path early
- do not ship the folder branch on wishful thinking
- keep the save-picker branch separate so one-off autosave can still ship even if persistent folder writes need one more iteration

## Revised Design

The bounded, honest version of the feature is:

- autosave remains high-fidelity-only
- save-picker fallback is first-class, not a degraded afterthought
- output folder stays optional and explicit
- picker choice never mutates Settings implicitly
- output-folder silent saves use uniquified names
- popup and Options both tell the truth about what will happen before the user clicks export

## Implementation Plan

### `planning`

- define the autosave and output-folder boundary
- correct the stale high-fidelity docs to match current implementation authority
- create downstream implementation issues

### `core`

- extend delivery metadata and failure codes
- add filename uniquify helpers and type coverage
- keep browser-print contracts unchanged

### `extension`

- persist autosave state
- add output-folder choose/change/clear controls
- implement save-picker and output-folder delivery branches
- add popup note and method-specific messaging
- add IndexedDB handle persistence and permission re-checks

### Verification

- unit coverage for settings state, popup note variants, and delivery-method mapping
- flow coverage for `browser-download`, `save-picker`, and `output-folder`
- regression coverage proving browser-print remains unchanged
- manual validation for picker cancellation, stale folder permission, and uniquified folder writes
- `pnpm run repo:verify` before implementation is called complete
