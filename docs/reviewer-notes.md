# Notes for Mozilla Reviewers

Draft for the release submission. Replace development-specific details with the
actual submitted version and final identity before sending.

## Purpose and account requirements

Tabest — Fuzzy Tab Finder is a keyboard-driven picker for existing browser tabs
and optional suggestions from locally stored browsing history.
It opens a dedicated local extension page rather than injecting UI into websites.
No account, login, subscription, external API, or test credentials are required.
The manifest names it Tabest — Fuzzy Tab Finder and retains the original technical
ID `telescope-browser@local.invalid` to preserve existing installation data.
That ID is not an email address or a claim of affiliation. Project license: MIT.
The source archive includes the root `LICENSE` file.

## Source and build

The extension is built from TypeScript using Vite. The source archive must be
attached separately and match the exact submitted version. See
[BUILDING.md](../BUILDING.md) for the current environment and commands.

`npm ci` installs dependencies and `npm run build` generates `dist/`, where
`manifest.json` is at the root. Build dependencies come from npm. There is no
remote executable code loaded by the extension at runtime.

Before submission, confirm the clean-build environment and record the exact
Node/npm/tool versions used. The current development baseline is Linux x86-64,
Node 26.2.0, and npm 11.16.0; it is not yet a certified cross-platform release build.

## Permission rationale and data

- `tabs` is used for metadata and tab-management operations.
- `search` submits only explicit launchQuery actions through the browser's default
  engine. Typing remains local; HTTP(S) address opening and native search create
  a tab in the caller's window. No provider is hardcoded.
- `storage.local` keeps preferences; `storage.session` keeps tab IDs and recency.
- Optional `history` is requested from the Suggest visited sites checkbox in
  Settings. Reads require opt-in plus permission, use the browser's index, and
  are disabled in private windows. Suggested URLs are opened only on selection;
  history records are not persisted in extension storage or uploaded.
- `<all_urls>` supports `tabs.captureTab()` for previewing a selected result without
  activating it. Capture is debounced and images use a bounded in-memory cache.

The current implementation has no telemetry or data-upload service. Private and
regular windows are separated in tab results and screenshot access checks.
Screenshots are not persisted to extension storage. Local extension resources
provide the UI; there are no content scripts. See [PRIVACY.md](../PRIVACY.md).

## Manual functional checks

Use a disposable profile and synthetic pages, not a real browsing session.

1. Open several ordinary web tabs, pin one, and optionally open a second window.
2. Open the picker with the toolbar action or Ctrl+Shift+Space. If the suggested
   shortcut conflicts, assign a different one in Manage Extension Shortcuts.
3. Search part of a page title or URL. Navigate with Ctrl+n/Ctrl+p and press Enter.
4. Reopen the picker, press Escape for Normal, and try j/k, h/l, and w.
   Pinned filtering and window scope are independent; changing filters keeps the query.
5. Use p to pin/unpin. Mark synthetic tabs with Tab and close them with dd.
   Multiple tabs or pinned tabs require confirmation. Verify that unrelated tabs remain.
6. Close/reopen the picker and select another surviving tab. Verify that deleted
   tabs are not reopened. Native browser undo is not invoked by this extension.
7. Inspect previews of ordinary pages. Restricted, missing, sleeping, or unpermitted
   targets have placeholders; narrow layouts hide the preview panel.
8. Change appearance and a picker binding in Settings; verify persistence.
9. If private-window access is enabled, check that normal and private results and
   previews do not cross contexts. Test this explicitly before claiming verification.
10. Enable Suggest visited sites, approve the optional permission, and save.
    Search a title or address from synthetic browsing history with fewer than five
    open-tab matches. Check the From history section, keyboard opening, disabled
    tab-management actions on its rows, and disappearance after history deletion
    or permission revocation. Private windows must never show history suggestions.
11. Type an HTTP(S) address or search phrase and use Alt+Enter or the action button.
    Verify a new tab opens in the same window, the default browser engine is used
    for text, and ordinary Enter still selects existing results. Check the action
    in both modes, empty results, and with a custom binding.

## Evidence to attach to the actual submission

Record the submitted version, source archive name, OS/browser/tool versions,
completed tests, and any known limitations. Do not paste this draft unchanged
while those fields are unresolved. Passing the Zen suite is not a substitute
for testing the submitted artifact in standard Firefox.

Mozilla requires matching sources and reproducible build instructions for bundled
extensions: [source submission requirements](https://extensionworkshop.com/documentation/publish/source-code-submission/).
