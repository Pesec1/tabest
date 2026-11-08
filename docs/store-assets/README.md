# Tabest listing assets

These are optional listing/announcement assets. They do not change the extension
manifest, version, or the package already submitted for review.

## GitHub README

The [project README](../../README.md) embeds the animated icon and both screenshots.
The promotional illustration and direct download links are in its expandable
artwork section. All media paths are relative to the repository, so no image
hosting or hardcoded owner/branch URLs are needed.

When publishing documentation changes, include the referenced PNG/GIF files in
this directory and `screenshots/` as well as the Markdown files. Verify the
rendered README after upload; a local file check does not verify GitHub rendering.

## Files

- `tabest-icon-128.png`: static AMO listing icon, exported from `public/icon.svg`.
- `tabest-icon-{32,48,96,512,1024}.png`: additional icon sizes for other uses.
- `tabest-icon-animated.gif`: 512 × 512, three-second looping brand animation.
  The cursor blinks and the gold dot pulses. This is not a recording of the UI.
- `tabest-promo.png`: AI-generated promotional illustration, not an app screenshot.
  Use it for announcements or as supplementary artwork, not as evidence of the UI.
- `screenshots/01-fuzzy-search.png`: real extension UI in Zen, search highlighting
  and an actual captured preview of a local demonstration page.
- `screenshots/02-pinned-and-marks.png`: real Normal mode, pinned-only filter,
  keyboard hints, and two tabs marked with Tab.

The screenshots use real browser tabs with synthetic local HTML content. They
are not generated artwork, mockups, or screenshots of the web demo. They capture
the extension content viewport (1280 × 800), without browser chrome. Local fixture
paths are expected; no personal tabs, browsing data, or external sites are used.

Suggested AMO captions:

1. “Search titles and URLs, then preview a tab before switching.”
2. “Filter pinned tabs and mark multiple tabs with Vim-style keyboard controls.”

## Use on Firefox Add-ons

Upload `tabest-icon-128.png` as the listing icon. Mozilla requires PNG/JPEG for
listing icons; the GIF is for README/social use, not the AMO icon field.

For the screenshot gallery, prioritize genuine screenshots of the current UI,
using synthetic tab titles/URLs rather than personal browser data. Mozilla
recommends 1280 × 800 screenshots. Animated gallery upload/playback has not been
verified; do not rely on GIF support there.

References: [AMO icon requirements](https://mozilla.github.io/addons-server/topics/api/addons.html#addon-icon),
[listing recommendations](https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/).

## Rebuild the icon exports

Requires Node.js, librsvg (`rsvg-convert`), and ImageMagick (`magick`):

```sh
node scripts/render-store-branding.mjs
```

The command replaces the generated PNG icons and GIF in this directory. It leaves
the original SVG and promotional illustration unchanged. Intermediate generated
frames are kept in ignored `node_modules/.cache/tabest-branding/`.

The promotional illustration was created with the built-in image generation
tool. Its full generation prompt is recorded in [PROMPTS.md](PROMPTS.md).

## Capture real UI screenshots

```sh
npm run build
node scripts/capture-store-screenshots.mjs
```

Requires Zen at `/opt/zen-browser-bin/zen` (override with `TABEST_ZEN_BINARY`).
The script copies the browser and extension into ignored
`node_modules/.cache/tabest-store-capture/`, uses a new profile and local file
fixtures, verifies UI state/preview/layout, and captures the rendered content.
Automation scripts are injected only into that temporary extension copy.
The capture refuses to overwrite existing screenshots: move those two PNG files
elsewhere before recapturing. It never accesses an existing browser profile.
