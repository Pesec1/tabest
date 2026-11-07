# Contributing to Tabest

Thanks for helping make tab switching feel more like a keyboard-driven picker.
The project uses the [MIT license](LICENSE). Public repository and maintainer
contact details are deferred. Only contribute third-party work when its license
and attribution requirements are compatible with its intended use here.

## Start with a reproducible scenario

For bugs, provide browser and OS versions, exact steps, expected behavior, and
actual behavior. Explain whether you used the toolbar button or a shortcut,
one or multiple windows, and normal or private browsing. For shortcut problems,
check competing browser commands, Zen mods, and other extensions first.

Do not attach browsing sessions, personal URLs, sensitive screenshots, or raw
console logs. Use small synthetic examples where possible.

For larger changes, discuss the behavior before implementing it. In particular,
changes to permissions, default keybindings, tab ranking, storage, and private
window handling should be deliberate rather than incidental.

## Develop locally

Follow [BUILDING.md](BUILDING.md). Source code is in `src/`; static manifest and
icon assets are in `public/`. `dist/` is generated output, not a source directory.

Use strict TypeScript, two-space indentation, single quotes, semicolons,
`camelCase` functions/variables, and `PascalCase` types/classes. Use `import type`
and `.ts` extensions for local TypeScript imports. Match the surrounding style;
the repository does not currently configure a standalone formatter.

## Test changes

```sh
npm test
npm run build
```

Add regression coverage to `tests/*.test.ts` for changed logic. Use the relevant
isolated Zen scenarios for UI, preview, filters, shortcuts, and tab lifecycle
changes. Never use your daily browser profile for destructive tab tests.
Documentation changes should have working relative links, existing source paths,
and accurate commands. There is no configured numerical coverage threshold.

## Before proposing a change

- Keep the scope small and preserve unrelated work.
- Describe the problem, the change, and how it was verified.
- Link an existing issue when relevant; screenshots help for visible UI changes.
- State checks that were skipped and why. Do not claim to have fixed a failure
  that has not been reproduced or otherwise established.
- Do not include credentials, local reports, browser profiles, or generated
  dependency directories.

No commit-message convention has been established in this guide. Agent-assisted
work follows [AGENTS.md](AGENTS.md) or [CLAUDE.md](CLAUDE.md): agents must not run
Git commands or create commits, branches, or pull requests without the user's
explicit permission. An approved code change is not automatic permission to push.
