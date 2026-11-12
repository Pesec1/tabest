import type { Snapshot } from './model.ts';

export function demoSnapshot(): Snapshot {
  const entries = [
    ['telescope.nvim — Find, Filter, Preview, Pick', 'https://github.com/nvim-telescope/telescope.nvim', 1],
    ['Neovim documentation: telescope', 'https://neovim.io/doc/user/', 1],
    ['tmux · Getting started', 'https://github.com/tmux/tmux/wiki/Getting-Started', 2],
    ['Mozilla · WebExtensions API', 'https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions', 1],
    ['The Rust Programming Language', 'https://doc.rust-lang.org/book/', 2],
    ['Pull requests · Tabest', 'https://github.com/pulls', 1],
    ['Lo-fi radio — music for deep work', 'https://www.youtube.com/watch?v=example', 2],
    ['TypeScript · Handbook', 'https://www.typescriptlang.org/docs/handbook/', 1],
    ['ArchWiki · Firefox', 'https://wiki.archlinux.org/title/Firefox', 2],
    ['Design notes · a quieter browser', 'https://example.com/notes/browser', 1],
    ['Vite · Getting started', 'https://vite.dev/guide/', 1],
    ['Git — Reference', 'https://git-scm.com/docs', 2],
  ] as const;
  return {
    windowId: 1, private: false,
    workSessions: { sessions: [{ id: 'work', name: 'Work' }], activeSessionId: 'all', autoAssign: true },
    tabs: entries.map(([title, url, windowId], i) => ({
      id: i + 1, windowId, title, url, lastUsed: Date.now() - i * 180_000,
      pinned: i === 0, audible: i === 6, muted: false, discarded: i === 10,
      origin: i === 3,
      sessionIds: i < 5 ? ['work'] : [],
    })),
  };
}
