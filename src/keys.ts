import type { Action, Keymap, Mode, Settings } from './model.ts';

export const defaultKeymap: Keymap = {
  insert: {
    'Ctrl+n': 'next', 'Ctrl+j': 'next', ArrowDown: 'next',
    'Ctrl+p': 'previous', 'Ctrl+k': 'previous', ArrowUp: 'previous',
    Enter: 'accept', Escape: 'normal', 'Ctrl+c': 'cancel',
    'Alt+Enter': 'launchQuery',
    Tab: 'markNext', 'Shift+Tab': 'markPrevious', 'Ctrl+/': 'help',
  },
  normal: {
    j: 'next', k: 'previous', ArrowDown: 'next', ArrowUp: 'previous',
    Enter: 'accept', Escape: 'cancel', 'Ctrl+c': 'cancel', i: 'insert', '/': 'insert',
    'Alt+Enter': 'launchQuery',
    gg: 'first', G: 'last', Home: 'first', End: 'last',
    Tab: 'markNext', 'Shift+Tab': 'markPrevious', dd: 'close',
    '?': 'help', w: 'scope', p: 'pin', h: 'allTabs', l: 'pinnedTabs',
  },
};

export const defaultSettings: Settings = { keymapVersion: 3, scope: 'all', theme: 'dark', layout: 'compact', showPreview: true, historySuggestions: false, keymap: defaultKeymap };
const actions = new Set<Action>([
  'next', 'previous', 'accept', 'cancel', 'normal', 'insert', 'first', 'last',
  'markNext', 'markPrevious', 'close', 'help', 'scope', 'pin', 'allTabs', 'pinnedTabs', 'launchQuery',
]);

export function validateKeymap(value: unknown): value is Keymap {
  if (!value || typeof value !== 'object') return false;
  const map = value as Keymap;
  return (['insert', 'normal'] as Mode[]).every(mode => {
    const entries = map[mode];
    return entries && typeof entries === 'object' && !Array.isArray(entries) &&
      Object.entries(entries).every(([key, action]) => key.length > 0 && key.length < 60 && actions.has(action as Action));
  });
}

export function readSettings(value: unknown): Settings {
  const settings = value as Partial<Settings> | undefined;
  const keymap = structuredClone(validateKeymap(settings?.keymap) ? settings.keymap : defaultKeymap);
  const version = (value as { keymapVersion?: number } | undefined)?.keymapVersion ?? 0;
  // Upgrade older saved maps without replacing custom bindings or sequences.
  // Versioned maps may deliberately omit the new actions.
  if (version < 2) {
    for (const [key, action] of [['h', 'allTabs'], ['l', 'pinnedTabs']] as const) {
      if (!Object.keys(keymap.normal).some(binding => binding.startsWith(key) || key.startsWith(binding)) &&
        !Object.values(keymap.normal).includes(action)) keymap.normal[key] = action;
    }
  }
  if (version < 3) {
    for (const mode of ['insert', 'normal'] as const) {
      const key = 'Alt+Enter';
      if (!Object.keys(keymap[mode]).some(binding => binding.startsWith(key) || key.startsWith(binding)) &&
        !Object.values(keymap[mode]).includes('launchQuery')) keymap[mode][key] = 'launchQuery';
    }
  }
  return {
    keymapVersion: 3,
    scope: settings?.scope === 'window' ? 'window' : 'all',
    theme: ['dark', 'light', 'system'].includes(settings?.theme ?? '') ? settings!.theme! : 'dark',
    layout: settings?.layout === 'comfortable' ? 'comfortable' : 'compact',
    showPreview: settings?.showPreview !== false,
    historySuggestions: settings?.historySuggestions === true,
    keymap,
  };
}

export function eventKey(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey'>): string {
  const modifiers = [event.ctrlKey ? 'Ctrl' : '', event.altKey ? 'Alt' : '', event.metaKey ? 'Meta' : ''];
  // Printable Shift combinations already appear in event.key (G, ?, /, etc.).
  if (event.shiftKey && (event.key.length > 1 || event.ctrlKey || event.altKey || event.metaKey)) modifiers.push('Shift');
  return [...modifiers.filter(Boolean), event.key].join('+');
}

export class KeyResolver {
  private pending = '';
  private at = 0;
  reset(): void { this.pending = ''; }
  resolve(key: string, mode: Mode, keymap: Keymap, now = Date.now()): { handled: boolean; action?: Action } {
    const map = keymap[mode];
    const sequence = now - this.at < 700 ? this.pending + key : key;
    this.pending = '';
    const exact = map[sequence] ?? map[key];
    if (exact) return { handled: true, action: exact };
    if (Object.keys(map).some(binding => binding.startsWith(sequence) && binding !== sequence)) {
      this.pending = sequence;
      this.at = now;
      return { handled: true };
    }
    if (Object.keys(map).some(binding => binding.startsWith(key) && binding !== key)) {
      this.pending = key;
      this.at = now;
      return { handled: true };
    }
    return { handled: false };
  }
}
