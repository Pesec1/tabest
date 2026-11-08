# Changelog

This is a development changelog, not a claim that these versions are published
on Firefox Add-ons. The current package version is **0.2.4**.

## Unreleased — Documentation and presentation

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
