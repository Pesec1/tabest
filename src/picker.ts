import './style.css';
import type { Action, Mode, Reply, Request, Settings, Snapshot, TabFilter, TabItem } from './model.ts';
import { defaultSettings, eventKey, KeyResolver, readSettings, validateKeymap } from './keys.ts';
import { searchTabs } from './search.ts';
import type { SearchResult } from './search.ts';
import { demoSnapshot } from './demo.ts';
import { PreviewView } from './preview-view.ts';
import { filterTabs, readTabFilter } from './filters.ts';
import { actionHints } from './action-hints.ts';

const extension = typeof browser !== 'undefined' && Boolean(browser.runtime?.id);
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" aria-label="Tabest home"><span class="brand-icon">⌕</span> tabest<span class="brand-divider">/</span><span class="brand-section">tabs</span></a>
    <div class="top-actions"><span id="context" class="context"></span><button id="layout-button" class="quiet" aria-pressed="true" title="Toggle compact layout">Compact</button><button id="preview-button" class="quiet" aria-pressed="true" title="Toggle page preview">Preview</button><button id="settings-button" class="quiet">Settings <span>↗</span></button></div>
  </header>
  <main>
    <div class="intro"><div><p class="eyebrow">YOUR BROWSER, WITHIN REACH</p><h1>A little less searching.<br><span>A little more flow.</span></h1></div><span class="session-label"><span class="live-dot"></span> LOCAL SESSION</span></div>
    <section class="workspace" aria-label="Tab picker">
      <div class="search-column">
        <div class="panel prompt-panel"><div class="panel-label"><label for="query">Find a tab</label><span id="query-count"></span></div><div class="prompt-line"><span class="prompt-symbol" aria-hidden="true">❯</span><input id="query" type="text" placeholder="Search titles and URLs…" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="results" /><kbd id="mode-indicator">INSERT</kbd></div></div>
        <div class="panel results-panel"><div class="panel-label results-heading"><span>Results <span id="result-count" class="count"></span></span><div class="result-filters"><div class="scope-control" role="group" aria-label="Search scope"><button id="scope-all">All windows</button><button id="scope-window">This window</button></div><div class="scope-control tab-filter" role="group" aria-label="Tab filter"><button id="filter-all">All tabs <kbd class="filter-key"></kbd></button><button id="filter-pinned">Pinned <kbd class="filter-key"></kbd></button></div></div></div><div id="results" role="listbox" aria-label="Open tabs" aria-multiselectable="true"></div><div class="results-bottom"><span id="selection-count">No tabs marked</span><div id="action-hints" aria-label="Available keyboard actions"></div></div></div>
      </div>
      <aside class="panel preview-panel" aria-label="Selected tab preview"><div class="panel-label"><span>Preview</span><span id="preview-index"></span></div><div id="preview"></div></aside>
    </section>
    <div class="statusbar"><div><span id="status-mode" class="status-mode">INSERT</span><span id="status" role="status" aria-live="polite">Start typing to find your next tab.</span></div><button id="help-button" class="quiet">Keybindings <kbd>?</kbd></button></div>
    <footer><span id="environment-note">Everything stays in your browser.</span><span>Find. Filter. Preview. Pick.</span></footer>
  </main>
  <dialog id="help-dialog"><div class="dialog-heading"><h2>Make yourself at home.</h2><button class="dialog-close quiet" aria-label="Close help">✕</button></div><p class="muted">Start in Insert. Press Escape for Normal. Escape again returns to your tab.</p><div id="bindings"></div><p class="muted">Normal defaults: h shows all tabs; l shows pinned tabs; w switches window scope. dd closes marked tabs, or the selected tab. p toggles pinning. Customize bindings in Settings.</p></dialog>
  <dialog id="settings-dialog"><div class="dialog-heading"><h2>Your Tabest.</h2><button class="dialog-close quiet" aria-label="Close settings">✕</button></div><form id="settings-form"><div class="settings-row"><label for="theme">Appearance</label><select id="theme"><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></div><div class="settings-row"><label for="default-scope">Default scope</label><select id="default-scope"><option value="all">All windows</option><option value="window">This window</option></select></div><p class="muted">Global shortcut: Ctrl+Shift+Space by default. Firefox lets you change it under Manage Extension Shortcuts.</p><button type="button" id="shortcut-settings" class="secondary">Configure Firefox shortcut ↗</button><label class="keymap-label" for="keymap">Keybindings <span class="muted">JSON · insert / normal</span></label><textarea id="keymap" spellcheck="false" rows="12"></textarea><p id="settings-error" class="error" role="alert"></p><div class="dialog-actions"><button type="button" id="reset-settings" class="quiet">Reset to defaults</button><button type="submit" class="primary">Save settings</button></div></form></dialog>
`;

function el<T extends HTMLElement = HTMLElement>(id: string): T { return document.getElementById(id) as T; }
const input = el<HTMLInputElement>('query');
const resultsNode = el('results');
const helpDialog = el<HTMLDialogElement>('help-dialog');
const settingsDialog = el<HTMLDialogElement>('settings-dialog');
let settings: Settings = structuredClone(defaultSettings);
let snapshot: Snapshot = { tabs: [], windowId: 0, private: false };
let results: SearchResult[] = [];
let selectedId: number | undefined;
let marks = new Set<number>();
let mode: Mode = 'insert';
let scope: Settings['scope'] = 'all';
let tabFilter: TabFilter = 'all';
let busy = false;
let refreshGeneration = 0;
let refreshTimer: ReturnType<typeof setTimeout>;
let pickerId: number | undefined;
const resolver = new KeyResolver();
const pagePreview = new PreviewView(async id => {
  if (!extension) return { state: 'unavailable', reason: 'demo' };
  const reply = await browser.runtime.sendMessage({ type: 'preview', id, pickerId }) as Reply | undefined;
  if (!reply?.ok || !reply.preview) throw new Error('Preview unavailable');
  return reply.preview;
});

function message(text: string, error = false): void {
  el('status').textContent = text;
  el('status').classList.toggle('error', error);
}

async function request(payload: Request): Promise<Snapshot | undefined> {
  if (!extension) {
    if (payload.type === 'select' || payload.type === 'return') {
      message('Preview mode. Load the extension in Firefox to switch real tabs.');
    } else if (payload.type === 'close') snapshot.tabs = snapshot.tabs.filter(tab => !payload.ids.includes(tab.id));
    else if (payload.type === 'pin') {
      const tab = snapshot.tabs.find(tab => tab.id === payload.id);
      if (tab) tab.pinned = !tab.pinned;
    }
    return snapshot;
  }
  const response = await browser.runtime.sendMessage({ ...payload, pickerId }) as Reply | undefined;
  if (!response) throw new Error('Background is unavailable. Reload the extension and try again.');
  if (!response.ok) throw new Error(response.error);
  return response.snapshot;
}

async function refresh(): Promise<void> {
  const generation = ++refreshGeneration;
  try {
    const updated = await request({ type: 'snapshot' });
    if (generation !== refreshGeneration || !updated) return;
    snapshot = updated;
    const ids = new Set(snapshot.tabs.map(tab => tab.id));
    marks = new Set([...marks].filter(id => ids.has(id)));
    render();
  } catch (error) { message(String(error instanceof Error ? error.message : error), true); }
}

function scheduleRefresh(): void {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void refresh(), 70);
}

function highlighted(text: string, positions: number[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const indices = new Set(positions);
  let buffer = '';
  let matched = false;
  const append = () => {
    if (!buffer) return;
    const node = matched ? document.createElement('mark') : document.createTextNode('');
    node.textContent = buffer;
    fragment.append(node);
  };
  for (let i = 0; i < text.length; i++) {
    if (indices.has(i) !== matched) { append(); buffer = ''; matched = indices.has(i); }
    buffer += text[i];
  }
  append();
  return fragment;
}

function domain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') || new URL(url).protocol; }
  catch { return url || 'No address'; }
}

function node(tag: string, className: string, text?: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function tabIcon(tab: TabItem, className: string): HTMLElement {
  const icon = node('span', className, domain(tab.url).charAt(0).toUpperCase());
  icon.setAttribute('aria-hidden', 'true');
  // Use the browser-provided icon; never guess URLs or contact an icon service.
  if (tab.favIconUrl && /^(https?:|data:image\/|moz-anno:favicon:|moz-extension:)/i.test(tab.favIconUrl)) {
    const image = document.createElement('img');
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('load', () => icon.replaceChildren(image), { once: true });
    image.src = tab.favIconUrl;
  }
  return icon;
}

function render(): void {
  const tabs = filterTabs(snapshot.tabs, snapshot.windowId, scope, tabFilter);
  // Never keep destructive selections hidden by a scope/filter change.
  const visibleIds = new Set(tabs.map(tab => tab.id));
  marks = new Set([...marks].filter(id => visibleIds.has(id)));
  results = searchTabs(tabs, input.value);
  if (!results.some(result => result.tab.id === selectedId)) selectedId = results[0]?.tab.id;
  resultsNode.replaceChildren();
  el('query-count').textContent = `${tabs.length} tabs`;
  el('result-count').textContent = String(results.length).padStart(2, '0');
  el('context').textContent = extension ? (snapshot.private ? 'Private window' : `Window ${snapshot.windowId}`) : 'INTERACTIVE PREVIEW';
  el('scope-all').classList.toggle('active', scope === 'all');
  el('scope-window').classList.toggle('active', scope === 'window');
  el('scope-all').setAttribute('aria-pressed', String(scope === 'all'));
  el('scope-window').setAttribute('aria-pressed', String(scope === 'window'));
  for (const [id, active] of [['filter-all', tabFilter === 'all'], ['filter-pinned', tabFilter === 'pinned']] as const) {
    el(id).classList.toggle('active', active);
    el(id).setAttribute('aria-pressed', String(active));
  }
  renderFilterHints();
  if (!results.length) {
    const empty = node('div', 'empty');
    empty.append(node('span', 'empty-symbol', '⌕'), node('h2', '', tabFilter === 'pinned' ? 'No pinned tabs found' : 'No tabs found'), node('p', '', tabFilter === 'pinned' ? 'Try a shorter query, search all windows, or switch to All tabs.' : 'Try a shorter query or search all windows.'));
    resultsNode.append(empty);
  }
  const fragment = document.createDocumentFragment();
  for (const result of results) {
    const { tab } = result;
    const row = node('div', 'result');
    row.id = `tab-${tab.id}`;
    row.dataset.id = String(tab.id);
    row.setAttribute('role', 'option');
    row.setAttribute('aria-label', `${tab.title}, ${tab.url}${marks.has(tab.id) ? ', marked' : ''}`);
    row.append(node('span', 'result-pointer', '›'));
    row.append(tabIcon(tab, 'tab-icon'));
    const content = node('div', 'result-content');
    const title = node('div', 'result-title');
    title.append(highlighted(tab.title, result.titlePositions));
    const url = node('div', 'result-url');
    url.append(highlighted(tab.url, result.urlPositions));
    content.append(title, url);
    row.append(content);
    const badges = node('div', 'result-badges');
    if (marks.has(tab.id)) badges.append(node('span', 'marked-badge', '✓'));
    if (tab.pinned) badges.append(node('span', 'small-badge', 'PIN'));
    if (tab.audible) badges.append(node('span', 'small-badge', tab.muted ? 'MUTE' : '♫'));
    if (tab.origin) badges.append(node('span', 'small-badge', 'FROM'));
    badges.append(node('span', 'window-badge', `W${tab.windowId}`));
    row.append(badges);
    fragment.append(row);
  }
  resultsNode.append(fragment);
  updateSelection();
}

function updateSelection(): void {
  for (const row of resultsNode.querySelectorAll<HTMLElement>('.result')) {
    const selected = Number(row.dataset.id) === selectedId;
    row.classList.toggle('selected', selected);
    row.classList.toggle('marked', marks.has(Number(row.dataset.id)));
    row.setAttribute('aria-selected', String(marks.has(Number(row.dataset.id))));
    row.setAttribute('data-active', String(selected));
  }
  if (selectedId !== undefined) input.setAttribute('aria-activedescendant', `tab-${selectedId}`);
  else input.removeAttribute('aria-activedescendant');
  el('selection-count').textContent = marks.size ? `${marks.size} tab${marks.size === 1 ? '' : 's'} marked` : 'No tabs marked';
  const index = results.findIndex(result => result.tab.id === selectedId);
  const selected = results[index]?.tab;
  const hints = el('action-hints');
  hints.replaceChildren();
  for (const hint of actionHints(settings, mode, marks.size, Boolean(selected), Boolean(selected?.pinned), selectedId !== undefined && marks.has(selectedId))) {
    const item = node('span', 'action-hint');
    item.append(node('kbd', '', hint.key), document.createTextNode(hint.label));
    hints.append(item);
  }
  el('preview-index').textContent = index >= 0 ? `${index + 1} / ${results.length}` : '—';
  // Only scroll the list: scrollIntoView can also move the whole page when
  // navigating a long list near the bottom of the viewport.
  const activeRow = document.getElementById(`tab-${selectedId}`);
  if (activeRow) {
    const row = activeRow.getBoundingClientRect();
    const list = resultsNode.getBoundingClientRect();
    if (row.top < list.top) resultsNode.scrollTop += row.top - list.top;
    else if (row.bottom > list.bottom) resultsNode.scrollTop += row.bottom - list.bottom;
  }
  renderPreview(results[index]);
}

function renderPreview(result?: SearchResult): void {
  const preview = el('preview');
  preview.replaceChildren();
  if (!settings.showPreview) { pagePreview.invalidate(); return; }
  if (!result) {
    pagePreview.invalidate();
    preview.append(node('p', 'preview-empty', 'Your next destination will appear here.')); return;
  }
  const { tab } = result;
  const identity = node('div', 'preview-identity');
  identity.append(tabIcon(tab, 'preview-icon'), node('span', 'preview-domain', domain(tab.url)));
  const title = node('h2', 'preview-title');
  title.title = tab.title;
  title.append(highlighted(tab.title, result.titlePositions));
  const url = node('p', 'preview-url');
  url.title = tab.url;
  url.append(highlighted(tab.url, result.urlPositions));
  const details = node('dl', 'details');
  const state = [tab.pinned && 'Pinned', tab.discarded && 'Sleeping', tab.audible && (tab.muted ? 'Muted' : 'Playing audio'), tab.origin && 'Opened from here'].filter(Boolean).join(' · ') || 'Open';
  const elapsed = Math.max(0, Math.floor((Date.now() - tab.lastUsed) / 60_000));
  for (const [label, value] of [
    ['WINDOW', `${tab.windowId}${tab.windowId === snapshot.windowId ? ' · current' : ''}`],
    ['STATE', state], ['LAST USED', tab.lastUsed ? (elapsed < 1 ? 'Just now' : elapsed < 60 ? `${elapsed} min ago` : `${Math.floor(elapsed / 60)} h ago`) : 'Unknown'],
    ...(tab.container ? [['CONTAINER', tab.container]] : []),
  ]) {
    const field = node('div', 'preview-detail');
    const description = node('dd', '', value);
    description.title = value;
    field.append(node('dt', '', label), description);
    details.append(field);
  }
  const actions = node('div', 'preview-actions');
  const select = node('button', 'primary', 'Switch to tab');
  select.append(node('kbd', '', '↵'));
  select.addEventListener('click', () => void execute('accept'));
  const pin = node('button', 'secondary', tab.pinned ? 'Unpin tab' : 'Pin tab');
  pin.addEventListener('click', () => void execute('pin'));
  actions.append(select, pin);
  const screenshot = node('figure', 'page-preview');
  screenshot.id = 'page-preview';
  screenshot.setAttribute('aria-label', 'Page snapshot');
  const summary = node('div', 'preview-summary');
  summary.append(identity, title, url);
  preview.append(summary, screenshot, details, actions);
  pagePreview.show(tab, screenshot);
}

function renderFilterHints(): void {
  for (const [id, action] of [['filter-all', 'allTabs'], ['filter-pinned', 'pinnedTabs']] as const) {
    const binding = Object.entries(settings.keymap.normal).find(([, value]) => value === action)?.[0];
    const hint = el(id).querySelector<HTMLElement>('.filter-key')!;
    hint.textContent = binding ?? '';
    hint.hidden = mode !== 'normal' || !binding;
  }
}

function setTabFilter(next: TabFilter): void {
  if (next === tabFilter) return;
  tabFilter = next;
  render();
  if (extension) void browser.storage.local.set({ tabFilter }).catch(() => message('Could not save tab filter.', true));
  else localStorage.setItem('telescope-tab-filter', tabFilter);
}

function setMode(next: Mode): void {
  mode = next;
  resolver.reset();
  input.readOnly = mode === 'normal';
  el('mode-indicator').textContent = mode.toUpperCase();
  el('status-mode').textContent = mode.toUpperCase();
  document.documentElement.dataset.mode = mode;
  renderFilterHints();
  updateSelection();
  input.focus({ preventScroll: true });
  message(mode === 'normal' ? 'j / k to navigate · i to type · Esc to return' : 'Start typing to find your next tab.');
}

function move(delta: number): void {
  if (!results.length) return;
  const index = results.findIndex(result => result.tab.id === selectedId);
  selectedId = results[(index + delta + results.length) % results.length].tab.id;
  updateSelection();
}

async function execute(action: Action): Promise<void> {
  if (busy) return;
  switch (action) {
    case 'next': move(1); return;
    case 'previous': move(-1); return;
    case 'normal': setMode('normal'); return;
    case 'insert': setMode('insert'); return;
    case 'first': selectedId = results[0]?.tab.id; updateSelection(); return;
    case 'last': selectedId = results.at(-1)?.tab.id; updateSelection(); return;
    case 'help': showHelp(); return;
    case 'scope': scope = scope === 'all' ? 'window' : 'all'; render(); return;
    case 'allTabs': setTabFilter('all'); return;
    case 'pinnedTabs': setTabFilter('pinned'); return;
    case 'markNext': case 'markPrevious':
      if (selectedId !== undefined) {
        if (marks.has(selectedId)) marks.delete(selectedId); else marks.add(selectedId);
        move(action === 'markNext' ? 1 : -1); render();
      }
      return;
  }
  if (action !== 'cancel' && selectedId === undefined && !marks.size) return;
  busy = true;
  try {
    let updated: Snapshot | undefined;
    if (action === 'accept' && selectedId !== undefined) updated = await request({ type: 'select', id: selectedId });
    else if (action === 'cancel') updated = await request({ type: 'return' });
    else if (action === 'pin' && selectedId !== undefined) updated = await request({ type: 'pin', id: selectedId });
    else if (action === 'close') {
      const ids = marks.size ? [...marks] : [selectedId!];
      if ((ids.length > 1 || snapshot.tabs.some(tab => ids.includes(tab.id) && tab.pinned)) &&
        !window.confirm(`Close ${ids.length} tab(s)?${snapshot.tabs.some(tab => ids.includes(tab.id) && tab.pinned) ? ' Includes pinned tabs.' : ''}`)) return;
      updated = await request({ type: 'close', ids });
      marks.clear();
      message(`Closed ${ids.length} tab(s). Undo: Ctrl+Shift+T.`);
    }
    if (updated) { snapshot = updated; render(); }
  } catch (error) {
    await refresh();
    message(error instanceof Error ? error.message : String(error), true);
  } finally { busy = false; }
}

function showHelp(): void {
  const bindings = el('bindings');
  bindings.replaceChildren();
  for (const mode of ['insert', 'normal'] as const) {
    const section = node('section', 'binding-section');
    section.append(node('h3', '', mode.toUpperCase()));
    const list = node('dl', 'binding-list');
    for (const [key, action] of Object.entries(settings.keymap[mode])) list.append(node('dt', '', key), node('dd', '', action));
    section.append(list);
    bindings.append(section);
  }
  helpDialog.showModal();
}

function fillSettings(value: Settings): void {
  el('settings-form').dataset.layout = value.layout;
  el('settings-form').dataset.preview = String(value.showPreview);
  el<HTMLSelectElement>('theme').value = value.theme;
  el<HTMLSelectElement>('default-scope').value = value.scope;
  el<HTMLTextAreaElement>('keymap').value = JSON.stringify(value.keymap, null, 2);
  el('settings-error').textContent = '';
}

function applyTheme(): void {
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.dataset.layout = settings.layout;
  document.documentElement.dataset.preview = String(settings.showPreview);
  el('layout-button').setAttribute('aria-pressed', String(settings.layout === 'compact'));
  el('preview-button').setAttribute('aria-pressed', String(settings.showPreview));
}

async function toggleView(field: 'layout' | 'showPreview'): Promise<void> {
  const next = { ...settings };
  if (field === 'layout') next.layout = next.layout === 'compact' ? 'comfortable' : 'compact';
  else next.showPreview = !next.showPreview;
  try {
    if (extension) await browser.storage.local.set({ settings: next });
    else localStorage.setItem('telescope-settings', JSON.stringify(next));
    settings = next;
    applyTheme(); render();
  } catch { message('Could not save view preferences.', true); }
  input.focus({ preventScroll: true });
}

input.addEventListener('input', () => { selectedId = undefined; render(); });
document.addEventListener('keydown', event => {
  if (event.isComposing || event.key === 'Process' || helpDialog.open || settingsDialog.open) return;
  const target = event.target as HTMLElement;
  if (target !== input && target.closest('button, select, textarea, a')) return;
  const resolved = resolver.resolve(eventKey(event), mode, settings.keymap);
  if (resolved.handled) {
    event.preventDefault();
    if (resolved.action) void execute(resolved.action);
  } else if (mode === 'normal' && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) event.preventDefault();
});
resultsNode.addEventListener('click', event => {
  const row = (event.target as HTMLElement).closest<HTMLElement>('.result');
  if (!row) return;
  selectedId = Number(row.dataset.id);
  updateSelection();
  void execute('accept');
});
el('scope-all').addEventListener('click', () => { scope = 'all'; render(); input.focus(); });
el('scope-window').addEventListener('click', () => { scope = 'window'; render(); input.focus(); });
el('filter-all').addEventListener('click', () => { setTabFilter('all'); input.focus({ preventScroll: true }); });
el('filter-pinned').addEventListener('click', () => { setTabFilter('pinned'); input.focus({ preventScroll: true }); });
el('help-button').addEventListener('click', showHelp);
el('layout-button').addEventListener('click', () => void toggleView('layout'));
el('preview-button').addEventListener('click', () => void toggleView('showPreview'));
el('settings-button').addEventListener('click', () => { fillSettings(settings); settingsDialog.showModal(); });
el('reset-settings').addEventListener('click', () => fillSettings(defaultSettings));
el('shortcut-settings').addEventListener('click', () => {
  if (extension) void browser.commands.openShortcutSettings().catch(() => { el('settings-error').textContent = 'Open about:addons → gear menu → Manage Extension Shortcuts.'; });
  else el('settings-error').textContent = 'Available when loaded as a Firefox extension.';
});
for (const dialog of [helpDialog, settingsDialog]) {
  dialog.querySelector('.dialog-close')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => input.focus());
}
el('settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const keymap: unknown = JSON.parse(el<HTMLTextAreaElement>('keymap').value);
    if (!validateKeymap(keymap)) throw new Error('Expected insert and normal objects mapping keys to known actions.');
    const next = readSettings({ ...settings, layout: el('settings-form').dataset.layout, showPreview: el('settings-form').dataset.preview !== 'false', keymapVersion: 2, theme: el<HTMLSelectElement>('theme').value, scope: el<HTMLSelectElement>('default-scope').value, keymap });
    if (extension) await browser.storage.local.set({ settings: next });
    else localStorage.setItem('telescope-settings', JSON.stringify(next));
    settings = next;
    scope = settings.scope;
    resolver.reset();
    applyTheme(); render(); settingsDialog.close();
    message('Settings saved.');
  } catch (error) { el('settings-error').textContent = error instanceof Error ? error.message : String(error); }
});
document.querySelector('.brand')!.addEventListener('click', event => {
  event.preventDefault(); input.value = ''; selectedId = undefined; render(); setMode('insert');
});

if (extension) {
  browser.runtime.onMessage.addListener(message => {
    if (message?.type === 'preview-invalidated') { pagePreview.invalidate(message.id); scheduleRefresh(); }
    else if (message?.type === 'changed') scheduleRefresh();
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) { settings = readSettings(changes.settings.newValue); applyTheme(); render(); }
    if (changes.tabFilter) { tabFilter = readTabFilter(changes.tabFilter.newValue); render(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { input.value = ''; selectedId = undefined; marks.clear(); setMode('insert'); scheduleRefresh(); }
  });
  window.addEventListener('focus', () => { scheduleRefresh(); if (!helpDialog.open && !settingsDialog.open) input.focus(); });
} else {
  el('environment-note').textContent = 'Preview with sample tabs · no browser access';
  snapshot = demoSnapshot();
}

async function initialize(): Promise<void> {
  try {
    if (extension) {
      pickerId = (await browser.tabs.getCurrent())?.id;
      settings = readSettings((await browser.storage.local.get('settings')).settings);
      tabFilter = readTabFilter((await browser.storage.local.get('tabFilter')).tabFilter);
    } else {
      settings = readSettings(JSON.parse(localStorage.getItem('telescope-settings') ?? 'null'));
      tabFilter = readTabFilter(localStorage.getItem('telescope-tab-filter'));
    }
    scope = settings.scope;
    applyTheme();
    await refresh();
    setMode('insert');
  } catch (error) { message(`Could not initialize: ${error instanceof Error ? error.message : error}`, true); }
}
void initialize();
