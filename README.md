# Tabest — Fuzzy Tab Finder

<p align="center">
  <a href="docs/store-assets/README.md">
    <img src="docs/store-assets/tabest-icon-animated.gif" width="88" height="88" alt="Tabest terminal icon with a blinking cursor">
  </a>
</p>

**Find your tabs. Keep your flow.**

A Telescope-inspired tab finder for Firefox and Zen, with fuzzy search,
Vim-style navigation, and page previews. Open a dedicated search tab, type a few
letters, and switch to the page you need without reaching for the mouse.

[Screenshots](#see-it-in-action) · [Quick start](#quick-start) ·
[Keybindings](#default-keys) · [Privacy](PRIVACY.md) · [MIT license](LICENSE)

**Release status:** version **0.2.4** has been submitted to Firefox Add-ons and is
awaiting review, as reported by the maintainer. A public installation link will
be added after publication. Until then, use the development installation below.

## What you can do

- Search open tab titles and URLs with fuzzy matching and multiple search terms.
- Move between Insert and Normal modes, with customizable keybindings.
- Preview available page snapshots and tab details without activating the target.
- Search all browser windows or only the current one.
- Switch between all tabs and pinned tabs independently of window scope.
- Mark several tabs, close a selection, or pin and unpin individual tabs.
- Choose dark, light, or system appearance.
- Use a compact layout with more visible results, or switch to the spacious view.
- Recognize tabs by their site icons and see keyboard hints for the current selection.
- Optionally suggest visited pages when few open tabs match your query.
- Organize tabs into local sessions, with automatic assignment and global search.

Tabs are ranked by match quality and recency. Pinned tabs do not receive a hidden
ranking boost: use the Pinned filter when you want to search only among them.
Tab lookup runs locally, without an account, analytics, or cloud backend.
Explicit web searches use the browser's default search engine.

## See it in action

### Find a tab before you leave your current one

Search titles and URLs, see matching text highlighted, and inspect an available
page snapshot before switching.

[![Tabest search with a highlighted title match, tab details, and a captured page preview](docs/store-assets/screenshots/01-fuzzy-search.png)](docs/store-assets/screenshots/01-fuzzy-search.png)

### Keep pinned tabs within reach

Press **Escape** for Normal mode, **l** to show pinned tabs, and **Tab** to mark
results. The active row and marked tabs have distinct visual states.

[![Tabest in Normal mode with the Pinned filter active and two tabs marked](docs/store-assets/screenshots/02-pinned-and-marks.png)](docs/store-assets/screenshots/02-pinned-and-marks.png)

These are actual extension screenshots captured in an isolated Zen instance at
1280 × 800, using synthetic local pages rather than personal browsing data.
The animated icon above is a branding animation, not a recording of the workflow.

## Quick start

1. Open the picker with **Ctrl+Shift+Space** or the extension's toolbar button.
2. Start typing in Insert mode to narrow the results.
3. Navigate with **Ctrl+n / Ctrl+p** or the arrow keys; press **Enter** to switch.
4. Press **Escape** for Normal mode, then **Escape** again to close the picker.

The global shortcut is a suggested browser binding. Change it under the browser's
**Manage Extension Shortcuts** settings if it conflicts with a Zen command, a mod,
another extension, or an operating-system shortcut.

## Default keys

| Action | Insert | Normal |
| --- | --- | --- |
| Next / previous result | Ctrl+n / Ctrl+p, Ctrl+j / Ctrl+k, arrows | j / k, arrows |
| Switch to selected tab | Enter | Enter |
| Open typed address / search the web | Alt+Enter | Alt+Enter |
| Enter Normal / Insert mode | Escape | i or / |
| Close picker | Ctrl+c | Escape or Ctrl+c |
| Mark and move next / previous | Tab / Shift+Tab | Tab / Shift+Tab |
| Close marked tabs, or selected tab | — | dd |
| Pin / unpin selected tab | — | p |
| Show all / pinned tabs | — | h / l |
| Toggle all windows / current window | — | w |
| Choose / create a session | — | s |
| Move marked tabs, or selected tab, to a session | — | m |
| First / last result | — | gg / G, Home / End |
| Show keybindings | Ctrl+/ | ? |

Settings includes the editable Insert/Normal keymap. The tab filter is remembered
between openings. Changing filters preserves the query and the active result
where possible; marks hidden by a scope or tab-filter change are cleared.

The picker starts in **Compact** view. Toggle **Compact** in the header to restore
the spacious layout, or toggle **Preview** to give the list the full width. Both
preferences are remembered. On narrow screens, the preview is hidden automatically.
The hints below the results reflect your active mode, marked tabs, and custom
keybindings. In Insert mode, Escape reveals the Normal-mode management actions.
Site icons come from browser-provided favicon addresses; unavailable icons fall
back to a domain initial. The screenshots above show the spacious layout.

## Sessions

Use the session button next to the search label, or press **s** in Normal mode.
The existing result list becomes a session chooser. Type a name and choose
**Create** to create an empty session. Choose a session to browse its tabs and
make it the destination for new tabs in this window. **All sessions** is the
initial selection: it shows every tab, including tabs without a session. Your
last selection, including All sessions, is restored when you reopen the picker.

The session selector sits on the left above the input, counts sit beside Results,
and the keyboard mode appears once in the bottom status bar. Opening, selecting
or cancelling the session chooser keeps your current mode. In Normal, use j/k
and Enter; press i or / explicitly to search or name a session. If you switch to
Insert, that mode stays active when you return to tabs. Escape returns to your
previous tab query without changing modes. These keys respect your custom keymap.

Type in the ordinary tab search to search across all sessions; results show
their session names. Selecting a result while a user-created session is active
adds that same browser tab to the current session, keeping all previous sessions.
There is no duplicate tab; All sessions shows each browser tab once. Selecting
from All sessions does not change membership. Window and pinned filters still apply. Mark tabs with Tab,
then choose **Move to session…** or press **m** in Normal mode. The chooser can
move tabs into an existing session or create one from your selection. Rename and
Delete controls appear beside sessions; deleting a session removes only that
membership and keeps its tabs open in any other sessions and **All sessions**.
An explicit move replaces the selected tabs' existing memberships; choosing
All sessions in the move chooser removes all their session assignments.
Closing a tab closes the actual browser tab in every session. Escape leaves the chooser and
restores your previous search. There is no built-in Unsorted session.

New tabs automatically join the current session; links opened in new tabs inherit
all their source tab's sessions. Disable automatic assignment in Settings to send
ordinary new tabs to the general list without an assignment. Selecting All
sessions also stops assigning ordinary new tabs to the previously chosen session;
links still inherit their source sessions. Explicit Alt+Enter/history opening and
the first-tab button in an empty session still use the chosen session. Selecting
an existing tab does not change the current session destination.

Sessions are local to Tabest: they do not hide, reorder, group, or pin browser
tabs. Normal sessions can contain tabs from multiple windows; each window keeps
its own destination. Empty sessions persist. Membership is attached to tabs using
the browser's session metadata and can follow browser-restored tabs; Tabest does
not reopen URLs or archive closed tabs. Private sessions use a separate temporary
catalog that is cleared after the last private window closes.

## Open an address or search the web

Type an address or a search phrase, then press **Alt+Enter** or click the action
under the input. `github.com` opens `https://github.com/`; `как настроить nginx`
searches with your browser's default engine in a new tab in the same window.
The action label shows **Open …** or **Search the web** before you submit.
This works even when no existing results match. Ordinary Enter still selects
the active result and does not automatically submit a web search.

HTTP(S) addresses, domains, localhost, IPv4 and bracketed IPv6 are supported.
Bare domains use HTTPS; bare localhost and IP addresses use HTTP. Empty input
does nothing. Unsupported protocols, credentials in URLs, and malformed explicit
HTTP(S) addresses are rejected. Plain single words are search phrases.

The local picker action is named `launchQuery` in the Insert/Normal keymap;
the displayed hint follows your actual binding. Migration preserves custom
bindings and sequences. Version 3 keymaps can deliberately omit the action.
No additional global shortcut is registered. The sample-data demo only reports
the intended action and does not navigate. Opening/searching does not require
history opt-in. Search uses the browser's
[native API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/search/search)
and the required `search` permission; the provider is not hardcoded.

## Suggestions from browsing history

Enable **Settings → Suggest visited sites**, allow history access in the browser
prompt, then save settings. With a nonempty query, fewer than five matching open
tabs, and the All tabs filter, up to five suggestions appear under **From history**.
Open tabs stay first; already open pages are excluded, including tabs in other
normal windows. History is not used in private windows or the sample-data demo.

Use the same navigation keys to reach a suggestion and press **Enter** to open it
in a new tab. If that page has opened in the meantime, Tabest switches to it.
Mark, close, and pin commands do not act on history rows. History suggestions
show page details without capturing a screenshot or loading the website.

Open-tab search updates immediately. History uses the browser's local index after
a 40 ms typing pause; late replies cannot replace newer queries or steal the
selected row. Among up to 100 matching history candidates, ranking considers
title/URL relevance, visit frequency, typed visits, and recency. This is a bounded
history search, not the browser address bar's complete autocomplete algorithm;
bookmarks and remote search suggestions are not included. The API matches query
words in titles and URLs; history lookup does not provide arbitrary fuzzy matches.

Turn the setting off to stop history reads. Revoking the optional permission or
deleting browser-history entries invalidates existing suggestions. The extension
does not persist its own history index. See the
[history API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/history/search)
and [privacy notice](PRIVACY.md).

## Privacy and permissions

Search runs locally. Tab titles, URLs, and available page snapshots are processed
inside the browser, not sent to a search service. Preview images are cached in
extension memory; they are not written to persistent extension storage.
Only an explicit Search the web action submits the entered text to the browser's
default search provider.

- **tabs:** read tab metadata and manage tab selection, closing, and pinning.
- **storage:** remember preferences and browser-session bookkeeping.
- **search:** submit an explicit web search through the browser's default engine.
- **history (optional):** find visited-page suggestions after you enable the feature.
- **Access to all websites:** required by the Firefox API used to capture page
  previews. Without the permission, preview shows a placeholder.

See the [privacy notice](PRIVACY.md) for storage details and limitations.

## Development installation

See [BUILDING.md](BUILDING.md) for environment requirements and caveats.

```sh
npm ci
npm test
npm run build
```

In a separate browser profile, open `about:debugging#/runtime/this-firefox`, choose
**Load Temporary Add-on**, and select `dist/manifest.json`. Temporary installation
is for development, not a substitute for the signed public release.

`npm run dev` watches source changes and rebuilds the extension. Reload the add-on
in `about:debugging` after rebuilding. `npm run preview` serves a sample-data demo;
it cannot manipulate real browser tabs.

## Compatibility and limitations

- The manifest targets **Firefox desktop 140+**. Automated native checks currently
  use an isolated Zen installation on Linux; a release must also be tested in
  standard Firefox. Android, Chromium, and Safari are not claimed as supported.
- Protected pages, sleeping tabs, missing permissions, or capture failures may
  prevent a screenshot. On narrow screens, the preview panel is hidden.
- The browser controls which pages and files an extension may access.
- Private-window access must be allowed by the user. The implementation separates
  private and regular tab results and previews; private-window checks remain part
  of the release checklist.

## Contributing and reporting issues

Read [CONTRIBUTING.md](CONTRIBUTING.md). When reporting a bug, include browser and
OS versions, exact reproduction steps, and expected versus actual behavior. Use
synthetic pages and remove personal information from screenshots and logs.

Agent instructions are in [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md), with
shared rules under [.agents/](.agents/AGENTS.md).

## Project status and publication

- [Changelog](CHANGELOG.md)
- [GitHub profile copy](docs/github-description.md)
- [Firefox Add-ons listing copy](docs/amo-listing.md)
- [Reviewer notes](docs/reviewer-notes.md)
- [Release checklist](docs/release-checklist.md)
- [Screenshots, icons, and asset reproduction instructions](docs/store-assets/README.md)

<details>
<summary>Brand artwork and image downloads</summary>

[![Tabest promotional illustration: browser tabs converging toward a selected tab](docs/store-assets/tabest-promo.png)](docs/store-assets/tabest-promo.png)

Promotional artwork generated with AI; not a screenshot of the interface.

[PNG icon, 128 × 128](docs/store-assets/tabest-icon-128.png) ·
[PNG icon, 1024 × 1024](docs/store-assets/tabest-icon-1024.png) ·
[Animated GIF icon](docs/store-assets/tabest-icon-animated.gif) ·
[Promotional image](docs/store-assets/tabest-promo.png)

</details>

Inspired by the interaction model of Telescope for Neovim. Not an official
Telescope, Neovim, Mozilla, or Zen project. The public name is
**Tabest — Fuzzy Tab Finder**. The store link will be added when the release is
public; no placeholder installation or support URLs are used.

The existing add-on ID and legacy local preference keys are intentionally retained
so renaming the product does not reset an existing installation's settings.
They are compatibility identifiers, not the public product name.

## License

[MIT](LICENSE). Use, modify, and distribute the code, including commercially,
provided the copyright and permission notices are retained. The software is
provided "as is", without warranties, with the liability disclaimer in the license.
Third-party components retain their own licenses.
