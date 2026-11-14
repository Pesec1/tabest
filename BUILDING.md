# Building and Verifying Tabest

## Current environment

The existing development build has been run on Linux x86-64 with **Node.js
26.2.0** and **npm 11.16.0**. TypeScript and Vite versions are pinned in
`package.json`, with dependency information in `package-lock.json`.

The release environment has not been standardized yet. Before publishing, verify
a clean install from the submitted sources on the documented Node/npm versions.
Do not assume that an existing `node_modules/` proves reproducibility or that
platform-specific native dependencies work on other architectures.

## Install, test, and build

From the directory containing `package.json`:

```sh
npm ci
npm test
npm run build
```

`npm ci` may need access to the npm registry. The build first runs TypeScript
without emitting files, then Vite. Both browser entry points and assets are
written to `dist/`; `public/manifest.json` and `public/icon.svg` are copied there.
There are no application API keys, backend credentials, or private build secrets.

Tests run directly from TypeScript with Node's built-in test runner using
`--test-isolation=none`. Keep the documented Node version when comparing results.

## Isolated browser tests

```sh
npm run test:zen
npm run test:zen:deletion
npm run test:zen:filters
npm run test:zen:ui
npm run test:zen:suggestions
npm run test:zen:query
npm run test:zen:sessions
```

Each command builds first, then runs a dedicated native-browser scenario.
The runner copies a Zen installation and the add-on into a new temporary directory,
creates a separate profile, and uses local fixtures. It does not use a user's
existing browser profile or modify the installed browser.

The UI scenario checks compact/spacious layout, preview visibility and persistence,
browser favicons, custom keyboard hints, the session/count/status layout, matching
settings switches and auto-add persistence, and a narrow viewport. It also saves
`ui-wide.png` and `ui-narrow.png` showing Settings beside its temporary `result.json` report.

The suggestions scenario seeds synthetic history in its fresh profile, grants
the optional permission only in that profile, and checks ranking, permission
denial/revocation, selection, the five-tab threshold, opening, deletion, and narrow
layout. Its opening fixture uses a browser-blocked loopback port; it does not
contact external websites. Screenshots are saved as `suggestions-wide.png` and
`suggestions-narrow.png` beside the report.

The query scenario installs a synthetic default search engine in the disposable
profile using a browser-blocked loopback port. Native Alt+Enter presses verify
both address opening and default-engine search, with Normal-mode, click,
custom-binding, empty/invalid-input and narrow-layout checks. No real search
provider is contacted. Screenshots are `query-wide.png` and `query-narrow.png`.

The sessions scenario checks creation, bulk moves, rename, global search,
native Ctrl+T followed by navigation, opener inheritance, browser tab restore,
explicit launching with auto-add off, private selection rejection, reload
persistence, deletion without closing tabs, and narrow layout. Screenshots are
`sessions-wide.png` and `sessions-narrow.png` beside the report.

The default binary is `/opt/zen-browser-bin/zen`. Override it when needed:

```sh
TABEST_ZEN_BINARY=/absolute/path/to/zen npm run test:zen
```

The earlier `TELESCOPE_ZEN_BINARY` variable remains a fallback for existing setups.
These tests require the browser and its native runtime dependencies. They are not
needed merely to compile the extension. Standard Firefox release verification is
a separate outstanding task, not something the Zen runner certifies.

## Extension validation and packaging

```sh
npm run lint:extension
npm run package
```

The current scripts invoke `npx --yes web-ext`, which may download a version from
the network. **Pin and lock `web-ext` before using this as a reproducible release
pipeline.** `lint:extension` inspects `dist/`, so build before running it alone.
`package` builds first and writes an unsigned archive under `artifacts/`.
An unsigned archive is not the final signed public release.

The extension archive must contain `manifest.json` at its root, not an outer
`dist/` directory. Do not upload the repository itself as the extension package.

## Source submission for Mozilla

Provide a separate source archive matching the exact uploaded extension version.
Include `src/`, `public/`, `picker.html`, `package.json`, `package-lock.json`,
`tsconfig.json`, `vite.config.mjs`, `LICENSE`, and this document. Include `tests/` and the
test scripts when documenting how reviewers can run the checks.

Exclude `node_modules/`, `.git/`, profiles, diagnostic reports, secrets, and stale
artifacts. The reviewer should be able to install dependencies and rebuild the
same `dist/` files using the commands above. Include a source README that points
to this document; a public repository link alone is not a source submission.

For the release process and unresolved prerequisites, see the
[release checklist](docs/release-checklist.md) and [reviewer notes](docs/reviewer-notes.md).
