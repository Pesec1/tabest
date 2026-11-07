# Privacy Notice

**Tabest — Fuzzy Tab Finder** · Updated November 8, 2026

This notice describes the current implementation. A public support contact and
repository URL have not been supplied; add them when publishing the project.

## Local processing

The extension uses open-tab titles, URLs, identifiers, window identifiers, and
tab state to display and search the picker. State can include pinning, audio,
container, and discarded status. Search terms are processed locally in the picker.

When a selected result can be previewed and the relevant permission is granted,
the extension requests a screenshot through the browser's tab-capture API.
Screenshots can contain sensitive information visible on a page. The extension
does not upload screenshots, tab metadata, or search terms.

There are no extension accounts, analytics, advertising SDKs, telemetry endpoints,
or automatic crash-report uploads in the current application code. It does not
inject content scripts into websites or download executable code.

## What is stored

| Location | Contents | Lifetime |
| --- | --- | --- |
| `browser.storage.local` | Theme, default window scope, custom keybindings, and selected tab filter. | Retained between browser sessions until preferences or extension data are cleared. |
| `browser.storage.session` | Picker/origin tab IDs, per-tab recency timestamps, and tracked picker/closed IDs. | Browser-session storage; may survive a background restart within that session. |
| Extension memory and picker DOM | Tab metadata, current query, selected/marked results, and bounded preview caches. | Temporary application state, not intentionally written to persistent extension storage. |

The extension does not maintain a persistent screenshot library or browsing-history
database. Browser storage, operating-system memory handling, and browser-managed
page/session history are outside this statement about extension-owned storage.

The sample-data demo uses the page's local storage for preferences instead of
extension storage. The demo has no access to real browser tabs.

## Permissions

- `tabs` exposes titles and URLs used for finding tabs and supplies tab-management
  functionality such as switching, closing, and pinning.
- `storage` keeps preferences and session bookkeeping locally.
- `<all_urls>` enables the Firefox `tabs.captureTab()` API used for page previews.
  It is broad permission; the extension currently uses it for capture, not for
  injecting scripts or modifying page contents. Captures remain subject to
  browser restrictions and permission grants.

These permissions describe access, not transmission to the developer.
Opening an existing web tab can cause normal browser/site network activity;
that is distinct from the extension uploading data.

## Private windows

The browser controls whether the extension is allowed in private windows.
The implementation filters tab results and preview requests to avoid crossing
between private and regular contexts. General preferences are extension-wide;
private mode does not create a separate settings store.

## Diagnostics and support

There is no automatic diagnostic upload. A maintainer may ask you to run the
optional `scripts/trace-tabs.js` tool manually. It records operations and IDs in
memory and replaces page URLs with local labels; it omits titles and screenshots.
The user explicitly exports and shares any report. Even a redacted report can
reveal tab counts, timing, and usage patterns: review it before sharing.

Browser-console errors and screenshots supplied in an issue can contain personal
information. Please redact them. A future public issue tracker is separate from
the extension and has its own service policies.

## Controls and changes

You can change preferences, revoke website access, disable private-window access,
or disable/remove the extension through the browser's add-on settings. Website
access restrictions disable unavailable previews rather than granting extra access.
Clearing extension/site data removes stored preferences in the relevant context.

If future features change data handling, this notice and the manifest's data
declarations must be updated before that version is published.
