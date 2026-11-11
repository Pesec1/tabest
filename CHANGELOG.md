# Changelog

This is a development changelog, not a claim that these versions are published
on Firefox Add-ons. The current package version is **0.2.4**.

## Unreleased

### Open a typed address or web search

- Add the local `launchQuery` action, suggested Alt+Enter in Insert and Normal,
  with a visible Open/Search action under the input and unchanged Enter selection.
- Open typed HTTP(S) addresses or submit text through the browser's default
  search engine into a new tab in the calling window; add the `search` permission.
- Migrate keymaps to version 3 without overwriting custom bindings/sequences;
  support deliberate omission, empty-input no-op, and explicit invalid-URL feedback.
- Add parser/launcher/migration tests and isolated Zen checks using real native
  Alt+Enter and a synthetic browser-default engine.

### Visited-page suggestions

- Add opt-in local history suggestions below open tabs when fewer than five tabs
  match a nonempty query in All tabs. Request the optional history permission from
  Settings; exclude private windows and the demo.
- Use the browser's history index after a 40 ms typing pause, rank up to 100
  candidates by relevance/frequency/recency, exclude open pages, and show at most five.
- Preserve keyboard selection as suggestions arrive; Enter opens the page or
  selects a tab opened in the meantime. Tab-management commands ignore history rows.
- Invalidate stale queries, deleted history and revoked permissions without storing
  a persistent history index; add unit and isolated Zen coverage.

### Picker usability

- Default to a compact layout with the search near the top and denser result rows;
  remember the compact/spacious layout and preview visibility toggles.
- Display browser-provided site icons in results and preview, with domain initials
  when an icon is unavailable and no third-party icon lookup service.
- Show contextual keyboard hints based on the active mode, marks, pin state, and
  the user's actual keymap, including deliberately removed bindings.
- Add isolated Zen UI coverage for the new controls, icons, hints, persistence,
  and narrow layout, with temporary screenshots for visual inspection.

### Documentation and presentation

- Embedded the animated brand icon and two real UI screenshots in the README.
- Added downloadable artwork and icon links, with AI artwork distinguished from
  actual extension screenshots and the icon GIF distinguished from a UI recording.
- Updated listing assets, GitHub copy, and publication notes to reflect the
  maintainer-reported GitHub push and AMO submission awaiting review.

## 0.2.4 — Development snapshot

### Branding and licensing

- Applied the confirmed name **Tabest — Fuzzy Tab Finder** to the manifest,
  picker, settings, page title, package metadata, diagnostics, and documentation.
- Added the MIT license, with no personal author or repository metadata invented.
- Retained the existing add-on ID and legacy preference keys for compatibility.
- Added `TABEST_ZEN_BINARY` with the old variable as a fallback; the diagnostic
  console handle is now `tabestTrace`, with the previous handle retained as an alias.
- Prepared project overview, privacy notice, build instructions, contribution
  guidance, listing copy, reviewer notes, and a release checklist.
- At the time of this development snapshot, repository creation, presentation
  assets, and store submission were deferred; see Unreleased for later updates.
  Author/contact metadata and CI are not supplied by these documentation updates.

## 0.2.3 — Development snapshot

- Added an independent All tabs / Pinned filter with Normal-mode `h` / `l` keys.
- Remembered the tab filter and preserved query/selection when switching filters.
- Preserved custom keybindings during migration and cleared marks hidden by a
  tab-filter or window-scope change.
- Added unit and isolated Zen coverage for filter behavior.

### Existing capabilities

Fuzzy title/URL search, Insert/Normal keymaps, tab switching, marking and closing,
pinning, page previews with fallbacks, window scope, and appearance settings are
available in the current development build. Earlier release dates and public
release history have not been reconstructed or asserted here.
