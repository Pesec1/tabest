# Firefox Add-ons Listing Copy

**Submission reported by the maintainer; awaiting review.** Public title:
**Tabest — Fuzzy Tab Finder**. This document preserves reusable listing copy;
the live submission and its fields have not been independently inspected.
The name is confirmed by the project owner. An indexed-web search did not reveal
an exact same-name browser extension, but this is not a trademark clearance or
a reservation. No public store or repository URL has been invented here.

## English name

Tabest — Fuzzy Tab Finder

## English summary

Find and switch tabs with fuzzy search, Vim-style keys, and local page previews.

## English description

Find your tabs. Keep your flow.

Tabest brings a Telescope-inspired picker to your browser. Open its dedicated
search tab from anywhere, type a few letters from a page title or URL, and jump
to the tab you need. Search is local, with no account or remote search service.

Built for keyboard-driven browsing:

- Fuzzy search across open tab titles and URLs.
- Insert mode for typing and Normal mode for Vim-style navigation.
- Page snapshots and tab details when a preview is available.
- Independent window-scope and pinned-tab filters.
- Multi-selection for closing tabs and a shortcut for pinning/unpinning.
- Customizable picker keybindings and dark, light, or system appearance.

Suggested shortcut: Ctrl+Shift+Space. You can also use the toolbar button.
Type to search, use Ctrl+n/Ctrl+p or arrows to navigate, and press Enter to
switch. Escape enters Normal mode: j/k navigate, h shows all tabs, l shows
pinned tabs, w changes window scope, and p toggles pinning. Tab marks results;
dd closes marked tabs or the selected tab. Escape again closes the picker.

Website access is used for page previews through Firefox's screenshot API.
Tab metadata, queries, and snapshots are not uploaded by the extension. Some
pages cannot be captured; sleeping tabs are not awakened just for a preview.
The browser controls private-window access. Read the privacy notice for details.

Designed for desktop Firefox and Zen. Preview is hidden on narrow layouts.
The extension is independent of Mozilla, Zen, Neovim, and Telescope.

If the shortcut conflicts with another command, change it in Manage Extension
Shortcuts and check your browser's own shortcuts and mods as well.

## Russian summary

Поиск и переключение вкладок с fuzzy search, Vim-клавишами и локальным превью.

## Russian description

Находи вкладки, не выпадая из потока.

Tabest добавляет в браузер отдельную вкладку поиска в духе Telescope. Начни
вводить часть заголовка или адреса, выбери результат и переключись на нужную
страницу. Поиск работает локально, без аккаунта и удалённого поискового сервиса.

- Нечёткий поиск по заголовкам и адресам открытых вкладок.
- Insert для ввода и Normal для навигации в стиле Vim.
- Снимок страницы и информация о выбранной вкладке, если превью доступно.
- Независимые фильтры по окнам и закреплённым вкладкам.
- Отметка нескольких вкладок для закрытия; закрепление и открепление.
- Настраиваемые клавиши и тёмная, светлая или системная тема.

Предлагаемый хоткей — Ctrl+Shift+Space; также доступна кнопка расширения.
В Normal: j/k — навигация, h/l — все или закреплённые вкладки, w — область окон,
p — закрепление, Tab — отметка, dd — закрытие. Escape из Insert включает Normal,
следующий Escape закрывает интерфейс.

Доступ к сайтам используется для локальных снимков превью. Расширение не
отправляет поисковые запросы, адреса, заголовки и снимки разработчику.
На защищённых и выгруженных страницах превью может быть недоступно.
Проект рассчитан на настольные Firefox и Zen; на узком экране панель превью скрыта.
Интерфейс расширения пока английский; русский текст здесь — перевод описания магазина.

## Permissions explanation

- `tabs`: tab metadata, search, switching, closing, and pinning.
- `storage`: local preferences and session bookkeeping.
- `<all_urls>`: page snapshots through `tabs.captureTab()`, not content injection.

The current manifest declares `data_collection_permissions.required: ["none"]`.
Confirm that the release still has no data transmission before keeping that
declaration. Local processing and requested permissions remain explained in
[PRIVACY.md](../PRIVACY.md).

## License

MIT. Use the matching root [LICENSE](../LICENSE), including its copyright,
permission, warranty, and liability notices. No personal author name has been set.

## Fields deferred until publication

- Final available AMO slug, publisher name, and public support contact.
- Actual repository/support URL and a public URL or pasted text for the privacy notice.
- Desktop compatibility/platform choices based on actual release testing.
- Confirm the submitted release version and version-specific release notes.

## Listing images

- Icon: [PNG, 128 × 128](store-assets/tabest-icon-128.png).
- First screenshot: [search and preview](store-assets/screenshots/01-fuzzy-search.png).
  Caption: “Search titles and URLs, then preview a tab before switching.”
- Second screenshot: [pinned tabs and selection](store-assets/screenshots/02-pinned-and-marks.png).
  Caption: “Filter pinned tabs and mark multiple tabs with Vim-style keyboard controls.”

Both screenshots are real 1280 × 800 captures in isolated Zen with synthetic local
pages. Use the static PNG for the listing icon, not the animated GIF. The
AI-generated promotional image is supplementary artwork, not a UI screenshot.
See the [asset guide](store-assets/README.md) for all files and reproduction steps.

Suggested category: Tabs, if available in the submission form. Do not claim an
Android release or verified Windows/macOS support without testing.

Use [reviewer-notes.md](reviewer-notes.md) for private review instructions, not as
marketing copy. Current submission guidance is in
[Mozilla's publishing documentation](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/).
