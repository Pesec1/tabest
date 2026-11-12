# Privacy Notice

**Tabest — Fuzzy Tab Finder** · Updated November 11, 2026

This notice describes the current implementation. A public support contact and
repository URL have not been supplied; add them when publishing the project.

## Local processing

The extension uses open-tab titles, URLs, identifiers, window identifiers, and
tab state to display and search the picker. State can include pinning, audio,
container, and discarded status. Search terms are processed locally in the picker.

Typing alone does not submit a web search. If you explicitly press Alt+Enter
(or your configured launchQuery binding) or click Search the web, the text is
submitted through the browser's native search API to its default search engine.
That provider receives the search and applies its own privacy policy. Choosing
Open for a typed HTTP(S) address navigates a new tab to that address. These actions
use the calling window, including its private context, and are separate from
local tab/history matching. The extension does not hardcode a search provider or
persist a separate list of submitted queries.

If you enable Suggest visited sites and grant the optional history permission,
nonempty queries with fewer than five matching open tabs also search the browser's
local history index. The extension reads up to 100 matching records, using titles,
addresses, visit counts, typed counts, and last-visit times to suggest up to five
pages. It does not load those websites until you choose Open. Queries and history
records are not sent to a remote search service. No history suggestions are
requested for private windows, the Pinned filter, or the sample-data demo.

Site icons use favicon addresses provided by the browser. Loading a remote icon
may make a normal image request to that address, subject to the browser's cache
and access rules; the picker omits the referrer. No third-party favicon lookup
service is used. Missing or failed icons show a domain initial instead.

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
| `browser.storage.local` | Theme, compact/spacious layout, preview visibility, history-suggestion opt-in, default window scope, custom keybindings, selected tab filter, normal session names/IDs and auto-add preference. | Retained between browser sessions until preferences or extension data are cleared. |
| `browser.storage.session` | Picker/origin tab IDs, per-tab recency timestamps, tracked picker/closed IDs, and private session catalog, tab membership and per-window destinations. | Browser-session storage; private session data is cleared after the last private window closes. |
| Browser session metadata (`browser.sessions`) | Each normal tab's list of session IDs and each normal window's selected session or All sessions. No URL archive is created. | Follows browser tab/window session restoration; deleting a session removes its ID while preserving other memberships. Legacy single-ID values remain readable. |
| Extension memory and picker DOM | Tab metadata, current query, selected/marked results, bounded preview caches, and current history suggestions. The background retains up to five offered history URLs for up to 20 pickers to validate explicit opening. | Temporary application state, not intentionally written to persistent extension storage. |

The extension does not maintain a persistent screenshot library or browsing-history
database. Browser storage, operating-system memory handling, and browser-managed
page/session history are outside this statement about extension-owned storage.

The sample-data demo uses the page's local storage for preferences instead of
extension storage. The demo has no access to real browser tabs.

## Permissions

- `tabs` exposes titles and URLs used for finding tabs and supplies tab-management
  functionality such as switching, closing, and pinning.
- `storage` keeps preferences and session bookkeeping locally.
- `sessions` attaches session membership and the chosen destination to normal
  tabs/windows, allowing browser-restored tabs to retain their membership.
- `search` runs only explicitly submitted web searches through the browser's
  search engine. It is not used for background suggestions as you type.
- Optional `history` enables visited-page suggestions only after feature opt-in
  and browser permission. Turning the feature off or revoking access stops reads;
  permission revocation and history deletion invalidate pending and visible results.
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
private mode does not create a separate general-settings store. Work sessions
are separate: private names and membership are written only to temporary
`storage.session`, never persistent local storage or browser session metadata.

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
