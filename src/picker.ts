import './style.css';
import type { Action, HistorySuggestion, Mode, Reply, Request, Settings, Snapshot, TabFilter, TabItem, WorkSession } from './model.ts';
import { defaultSettings, eventKey, KeyResolver, readSettings, validateKeymap } from './keys.ts';
import { fuzzyMatch, searchTabs } from './search.ts';
import type { SearchResult } from './search.ts';
import { demoSnapshot } from './demo.ts';
import { PreviewView } from './preview-view.ts';
import { filterTabs, readTabFilter } from './filters.ts';
import { actionHints } from './action-hints.ts';
import { SuggestionSearch } from './suggestion-search.ts';
import { historyUrl } from './history-suggestions.ts';
import { queryAction } from './query-action.ts';
import { ALL_SESSIONS } from './work-sessions.ts';

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
el('query').closest('.prompt-panel')!.querySelector('label')!.insertAdjacentHTML('afterend', `
  <button id="sessions-button" class="session-switch" type="button" aria-expanded="false" aria-controls="results">Sessions ▾</button>
`);
app.insertAdjacentHTML('beforeend', `<dialog id="session-name-dialog"><form id="session-name-form"><div class="dialog-heading"><h2>Rename session</h2><button type="button" class="dialog-close quiet" aria-label="Cancel rename">✕</button></div><label for="session-name">Session name</label><input id="session-name" maxlength="80" required autocomplete="off" /><p id="session-name-error" class="error" role="alert"></p><div class="dialog-actions"><button type="submit" class="primary">Save name</button></div></form></dialog>`);
el('settings-form').insertAdjacentHTML('afterbegin', `
  <div class="settings-row"><label for="session-auto">Add new tabs to sessions automatically</label><input id="session-auto" type="checkbox" /></div>
  <p class="muted">New tabs join the current session; links opened in new tabs inherit the source session. Existing tabs stay where you put them. Private sessions are temporary and separate.</p>
  <div class="settings-row"><label for="history-suggestions">Suggest visited sites</label><input id="history-suggestions" type="checkbox" /></div>
  <p class="muted">When fewer than 5 open tabs match, suggest up to 5 visited pages. Uses local browsing history with your permission; unavailable in private windows.</p>
`);
el('query').closest('.prompt-panel')!.insertAdjacentHTML('beforeend', `
  <div id="query-action" class="query-action" hidden><button id="query-action-button" type="button"><span id="query-action-label"></span><kbd id="query-action-key"></kbd></button></div>
`);
const input = el<HTMLInputElement>('query');
const resultsNode = el('results');
const helpDialog = el<HTMLDialogElement>('help-dialog');
const settingsDialog = el<HTMLDialogElement>('settings-dialog');
const sessionNameDialog = el<HTMLDialogElement>('session-name-dialog');
let renameSessionId = '';
let settings: Settings = structuredClone(defaultSettings);
let snapshot: Snapshot = { tabs: [], windowId: 0, private: false };
let results: SearchResult[] = [];
let choices: { id: number | string; tab?: SearchResult; history?: HistorySuggestion; session?: WorkSession; create?: string; allSessions?: boolean }[] = [];
let sessionMode: 'switch' | 'move' | undefined;
let sessionMoveIds: number[] = [];
let savedSearch = { query: '', selectedId: undefined as number | string | undefined, mode: 'insert' as Mode };
let selectedId: number | string | undefined;
let marks = new Set<number>();
let mode: Mode = 'insert';
let scope: Settings['scope'] = 'all';
let tabFilter: TabFilter = 'all';
let busy = false;
let permissionPending = false;
let refreshGeneration = 0;
let refreshTimer: ReturnType<typeof setTimeout>;
let pickerId: number | undefined;
const resolver = new KeyResolver();
const historySearch = new SuggestionSearch(async query => {
  const reply = await browser.runtime.sendMessage({ type: 'history', query, pickerId }) as Reply | undefined;
  if (!reply?.ok) throw new Error('History unavailable');
  return reply.suggestions ?? [];
}, () => render());
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
    if (payload.type.startsWith('session-')) {
      const state = snapshot.workSessions!;
      if (payload.type === 'session-create') {
        if (state.sessions.some(session => session.name.toLowerCase() === payload.name.trim().toLowerCase())) throw new Error('A session with this name already exists.');
        const id = crypto.randomUUID(); state.sessions.push({ id, name: payload.name.trim() }); state.activeSessionId = id;
        for (const tab of snapshot.tabs) if (payload.ids.includes(tab.id)) tab.sessionIds = [id];
      } else if (payload.type === 'session-switch') state.activeSessionId = payload.sessionId;
      else if (payload.type === 'session-move') { for (const tab of snapshot.tabs) if (payload.ids.includes(tab.id)) tab.sessionIds = payload.sessionId === ALL_SESSIONS ? [] : [payload.sessionId]; }
      else if (payload.type === 'session-rename') { const session = state.sessions.find(session => session.id === payload.sessionId); if (session) session.name = payload.name.trim(); }
      else if (payload.type === 'session-delete') {
        state.sessions = state.sessions.filter(session => session.id !== payload.sessionId);
        for (const tab of snapshot.tabs) tab.sessionIds = tab.sessionIds?.filter(id => id !== payload.sessionId);
        if (state.activeSessionId === payload.sessionId) state.activeSessionId = ALL_SESSIONS;
      } else if (payload.type === 'session-auto') state.autoAssign = payload.enabled;
      else message('Preview mode. Load the extension to open new tabs.');
    } else if (payload.type === 'launch-query') {
      message('Preview mode. Load the extension to open an address or search the web.');
    } else if (payload.type === 'select' || payload.type === 'return') {
      if (payload.type === 'select') {
        const tab = snapshot.tabs.find(tab => tab.id === payload.id);
        const id = snapshot.workSessions?.activeSessionId;
        if (tab && id && id !== ALL_SESSIONS) tab.sessionIds = [...new Set([...(tab.sessionIds ?? []), id])];
      }
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

function openSessions(next: 'switch' | 'move'): void {
  if (busy) return;
  sessionMoveIds = next === 'move' ? (marks.size ? [...marks] : typeof selectedId === 'number' ? [selectedId] : []) : [];
  if (next === 'move' && !sessionMoveIds.length) { message('Select or mark an open tab first.'); return; }
  savedSearch = { query: input.value, selectedId, mode };
  sessionMode = next;
  input.value = '';
  const activeId = snapshot.workSessions?.activeSessionId ?? ALL_SESSIONS;
  selectedId = activeId === ALL_SESSIONS ? 'all-sessions' : `session:${activeId}`;
  historySearch.reset();
  render(); setMode('insert');
  message(next === 'move' ? 'Choose a destination, or type a name to create a session.' : 'Choose a session, or type a name to create one.');
}

function leaveSessions(): void {
  sessionMode = undefined;
  input.value = savedSearch.query;
  selectedId = savedSearch.selectedId;
  render(); setMode(savedSearch.mode);
}

async function sessionAction(payload: Request): Promise<void> {
  if (busy) throw new Error('Wait for the current action to finish.');
  busy = true; ++refreshGeneration;
  try {
    const updated = await request(payload);
    if (updated) snapshot = updated;
    render();
  } catch (error) { message(error instanceof Error ? error.message : String(error), true); throw error; }
  finally { busy = false; updateQueryAction(); }
}

async function acceptSession(): Promise<void> {
  const choice = choices.find(choice => choice.id === selectedId);
  if (!choice) return;
  if (choice.create === '') { input.focus(); message('Type a name, then choose Create session.'); return; }
  try {
    if (choice.allSessions) {
      await sessionAction(sessionMode === 'move' ? { type: 'session-move', sessionId: ALL_SESSIONS, ids: sessionMoveIds } : { type: 'session-switch', sessionId: ALL_SESSIONS });
    }
    else if (choice.create !== undefined) {
      await sessionAction({ type: 'session-create', name: choice.create, ids: sessionMode === 'move' ? sessionMoveIds : [] });
    } else if (choice.session) {
      if (sessionMode === 'move') await sessionAction({ type: 'session-move', sessionId: choice.session.id, ids: sessionMoveIds });
      else {
        await sessionAction({ type: 'session-switch', sessionId: choice.session.id });
      }
    }
    const moved = sessionMode === 'move';
    if (moved) marks.clear();
    leaveSessions();
    message(moved ? (choice.allSessions ? 'Session assignment removed. Tabs stay open in All sessions.' : 'Tabs moved to the session.') : choice.allSessions ? 'All sessions selected.' : 'Session selected. Type to search across all sessions.');
  } catch { /* Keep the chooser and selection available for retry. */ }
}

function renameSession(session: WorkSession): void {
  if (busy) return;
  renameSessionId = session.id;
  el<HTMLInputElement>('session-name').value = session.name;
  el('session-name-error').textContent = '';
  sessionNameDialog.showModal(); el<HTMLInputElement>('session-name').select();
}

async function deleteSession(session: WorkSession): Promise<void> {
  if (!window.confirm(`Delete session “${session.name}”? Its tabs will stay open in All sessions.`)) return;
  try { await sessionAction({ type: 'session-delete', sessionId: session.id }); }
  catch { /* Error is visible in the status bar. */ }
}

function renderSessions(): void {
  const state = snapshot.workSessions;
  const query = input.value.trim().toLowerCase();
  choices = (state?.sessions ?? []).filter(session => query.split(/\s+/).every(word => fuzzyMatch(session.name, word)))
    .map(session => ({ id: `session:${session.id}`, session }));
  if (query.split(/\s+/).every(word => fuzzyMatch('All sessions', word))) choices.unshift({ id: 'all-sessions', allSessions: true });
  if (!query || (query !== 'all sessions' && !state?.sessions.some(session => session.name.toLowerCase() === query))) choices.push({ id: 'create-session', create: input.value.trim() });
  if (!choices.some(choice => choice.id === selectedId)) selectedId = choices[0]?.id;
  resultsNode.replaceChildren();
  resultsNode.setAttribute('aria-label', sessionMode === 'move' ? 'Destination sessions' : 'Sessions');
  resultsNode.setAttribute('aria-multiselectable', 'false');
  el('query-count').textContent = `${state?.sessions.length ?? 0} sessions`;
  el('result-count').textContent = String(choices.length).padStart(2, '0');
  for (const [index, choice] of choices.entries()) {
    const row = node('div', 'result session-result');
    row.id = `session-row-${index}`; row.dataset.key = String(choice.id); row.setAttribute('role', 'option');
    const session = choice.session;
    const content = node('div', 'result-content');
    const title = session?.name ?? (choice.allSessions ? 'All sessions' : choice.create ? `Create “${choice.create}”` : 'Create session…');
    content.append(node('div', 'result-title', title), node('div', 'result-url', session ? `${snapshot.tabs.filter(tab => tab.sessionIds?.includes(session.id)).length} open tabs${session.id === state?.activeSessionId ? ' · current destination for new tabs' : ''}` : choice.allSessions ? (sessionMode === 'move' ? 'Remove all session assignments; keep tabs in the general list' : `${snapshot.tabs.length} open tabs across all sessions${state?.activeSessionId === ALL_SESSIONS ? ' · selected' : ''}`) : 'Type a new name and press Enter'));
    row.append(node('span', 'result-pointer', '›'), node('span', 'tab-icon', choice.create !== undefined ? '+' : '▤'), content);
    if (session) {
      const actions = node('div', 'session-row-actions');
      for (const [label, action] of [['Rename', () => renameSession(session)], ['Delete', () => void deleteSession(session)]] as const) {
        const button = node('button', 'quiet', label); button.setAttribute('aria-label', `${label} ${session.name}`);
        button.addEventListener('click', event => { event.stopPropagation(); action(); }); actions.append(button);
      }
      row.append(actions);
    }
    resultsNode.append(row);
  }
  updateSelection();
}

function renderSessionPreview(session?: WorkSession): void {
  pagePreview.invalidate();
  const preview = el('preview'); preview.replaceChildren();
  if (!settings.showPreview) return;
  const summary = node('div', 'preview-summary');
  summary.append(node('span', 'preview-domain', 'SESSIONS'), node('h2', 'preview-title', session?.name ?? 'A space for your tabs'), node('p', 'preview-url', 'Sessions organize tabs inside Tabest. Your browser tabs stay in place.'));
  const note = node('div', 'history-preview-note', sessionMode === 'move' ? 'Move replaces existing session assignments. Selecting a tab from search adds it to the current session while keeping its other sessions.' : 'Choose a session for new tabs. Type a name to create an empty session. Selecting a search result adds that tab to the current session.');
  preview.append(summary, note);
}

el('session-name-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await sessionAction({ type: 'session-rename', sessionId: renameSessionId, name: el<HTMLInputElement>('session-name').value });
    sessionNameDialog.close();
  } catch (error) { el('session-name-error').textContent = error instanceof Error ? error.message : String(error); }
});

function render(): void {
  const state = snapshot.workSessions;
  const sessionBrowse = state?.activeSessionId === ALL_SESSIONS ? undefined : state?.activeSessionId;
  const current = state?.sessions.find(session => session.id === state.activeSessionId);
  el('sessions-button').textContent = `${current?.name ?? 'All sessions'} ▾`;
  el('sessions-button').title = `${current ? `New tabs → ${current.name}` : 'All open tabs. New tabs have no session assignment'}${state?.autoAssign === false ? ' (auto-add off)' : ''}. Choose or create a session.`;
  el('sessions-button').setAttribute('aria-expanded', String(Boolean(sessionMode)));
  el('query').closest('.prompt-panel')!.querySelector('label')!.textContent = sessionMode ? (sessionMode === 'move' ? `Move ${sessionMoveIds.length} tab(s) to` : 'Choose a session') : input.value.trim() ? 'Find a tab · all sessions' : sessionBrowse ? `Tabs · ${state?.sessions.find(session => session.id === sessionBrowse)?.name}` : 'Find a tab · all sessions';
  input.placeholder = sessionMode ? 'Find a session or type a new name…' : 'Search titles and URLs across sessions…';
  document.documentElement.dataset.sessionPicker = String(Boolean(sessionMode));
  if (sessionMode) { renderSessions(); return; }
  resultsNode.setAttribute('aria-label', 'Open tabs');
  resultsNode.setAttribute('aria-multiselectable', 'true');
  const tabs = filterTabs(snapshot.tabs, snapshot.windowId, scope, tabFilter).filter(tab => input.value.trim() || !sessionBrowse || tab.sessionIds?.includes(sessionBrowse));
  // Never keep destructive selections hidden by a scope/filter change.
  const visibleIds = new Set(tabs.map(tab => tab.id));
  marks = new Set([...marks].filter(id => visibleIds.has(id)));
  results = searchTabs(tabs, input.value);
  historySearch.update(input.value, extension && settings.historySuggestions && !snapshot.private && tabFilter === 'all' && results.length < 5);
  const openUrls = new Set(snapshot.tabs.map(tab => historyUrl(tab.url)));
  const suggestions = historySearch.items.filter(item => !openUrls.has(historyUrl(item.url)));
  choices = [...results.map(tab => ({ id: tab.tab.id, tab })),
    ...suggestions.map(history => ({ id: `history:${history.url}`, history }))];
  if (!choices.some(result => result.id === selectedId)) selectedId = choices[0]?.id;
  resultsNode.replaceChildren();
  el('query-count').textContent = `${tabs.length} tabs`;
  el('result-count').textContent = String(choices.length).padStart(2, '0');
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
  if (!choices.length) {
    const empty = node('div', 'empty');
    empty.append(node('span', 'empty-symbol', '⌕'), node('h2', '', tabFilter === 'pinned' ? 'No pinned tabs found' : 'No tabs found'), node('p', '', tabFilter === 'pinned' ? 'Try a shorter query, search all windows, or switch to All tabs.' : 'Try a shorter query or search all windows.'));
    if (!input.value.trim() && sessionBrowse && tabFilter === 'all' && !tabs.length) {
      empty.querySelector('h2')!.textContent = 'Your session starts here';
      empty.querySelector('p')!.textContent = 'Open a new tab here, or type an address or search across all sessions.';
      const open = node('button', 'primary', `New tab in ${current?.name ?? 'All sessions'}`);
      open.id = 'empty-session-new-tab';
      open.addEventListener('click', () => { void sessionAction({ type: 'session-new-tab' }).catch(() => {}); });
      empty.append(open);
    }
    resultsNode.append(empty);
    if (historySearch.state === 'loading') empty.querySelector('p')!.textContent = 'Looking for visited pages…';
    if (historySearch.state === 'error') empty.querySelector('p')!.textContent = 'History is unavailable. Check its permission in Settings.';
  }
  const fragment = document.createDocumentFragment();
  if (suggestions.length && results.length) fragment.append(node('div', 'result-section', `Open tabs · ${results.length}`));
  for (const result of results) {
    const { tab } = result;
    const row = node('div', 'result');
    row.id = `tab-${tab.id}`;
    row.dataset.id = String(tab.id);
    row.dataset.key = String(tab.id);
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
    const sessionNames = state?.sessions.filter(session => tab.sessionIds?.includes(session.id)).map(session => session.name).join(' · ');
    if (sessionNames) { const badge = node('span', 'session-badge', sessionNames); badge.title = sessionNames; badges.append(badge); }
    badges.append(node('span', 'window-badge', `W${tab.windowId}`));
    row.append(badges);
    fragment.append(row);
  }
  if (suggestions.length) fragment.append(node('div', 'result-section', `From history · ${suggestions.length}`));
  for (const [index, item] of suggestions.entries()) {
    const row = node('div', 'result history-result');
    row.id = `history-${index}`;
    row.dataset.key = `history:${item.url}`;
    row.dataset.history = item.url;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-label', `${item.title}, ${item.url}, open in new tab`);
    row.append(node('span', 'result-pointer', '›'), node('span', 'tab-icon', domain(item.url).charAt(0).toUpperCase()));
    const content = node('div', 'result-content');
    const title = node('div', 'result-title'); title.append(highlighted(item.title, item.titlePositions));
    const url = node('div', 'result-url'); url.append(highlighted(item.url, item.urlPositions));
    content.append(title, url);
    row.append(content, node('span', 'history-action', '↵ Open'));
    fragment.append(row);
  }
  resultsNode.append(fragment);
  updateSelection();
}

function updateSelection(): void {
  updateQueryAction();
  for (const row of resultsNode.querySelectorAll<HTMLElement>('.result')) {
    const selected = row.dataset.key === String(selectedId);
    row.classList.toggle('selected', selected);
    row.classList.toggle('marked', marks.has(Number(row.dataset.id)));
    row.setAttribute('aria-selected', String(sessionMode ? selected : marks.has(Number(row.dataset.id))));
    row.setAttribute('data-active', String(selected));
  }
  const activeRow = resultsNode.querySelector<HTMLElement>('.result.selected');
  if (activeRow) input.setAttribute('aria-activedescendant', activeRow.id);
  else input.removeAttribute('aria-activedescendant');
  el('selection-count').textContent = marks.size ? `${marks.size} tab${marks.size === 1 ? '' : 's'} marked` : 'No tabs marked';
  const index = choices.findIndex(result => result.id === selectedId);
  const choice = choices[index];
  const selected = choice?.tab?.tab;
  if (sessionMode) {
    el('selection-count').textContent = sessionMode === 'move' ? `${sessionMoveIds.length} tab(s) to move` : 'Choose where new tabs go';
    const binding = (action: Action) => Object.entries(settings.keymap[mode]).find(([, value]) => value === action)?.[0];
    el('action-hints').replaceChildren(node('span', 'action-hint', `${binding('previous') ?? ''} / ${binding('next') ?? ''} Choose · ${binding('accept') ?? 'Click'} Confirm · Esc Back`));
    el('preview-index').textContent = index >= 0 ? `${index + 1} / ${choices.length}` : '—';
    renderSessionPreview(choice?.session);
    if (activeRow) {
      const row = activeRow.getBoundingClientRect(); const list = resultsNode.getBoundingClientRect();
      if (row.top < list.top) resultsNode.scrollTop += row.top - list.top;
      else if (row.bottom > list.bottom) resultsNode.scrollTop += row.bottom - list.bottom;
    }
    return;
  }
  const hints = el('action-hints');
  hints.replaceChildren();
  const available = actionHints(settings, mode, choice?.history ? 0 : marks.size, Boolean(selected), Boolean(selected?.pinned), typeof selectedId === 'number' && marks.has(selectedId));
  if (choice?.history) {
    const key = Object.entries(settings.keymap[mode]).find(([, action]) => action === 'accept')?.[0];
    if (key) available.unshift({ key, label: 'Open in new tab' });
  }
  for (const hint of available) {
    const item = node('span', 'action-hint');
    item.append(node('kbd', '', hint.key), document.createTextNode(hint.label));
    hints.append(item);
  }
  const moveButton = node('button', 'quiet move-session-button', 'Move to session…');
  moveButton.hidden = !marks.size && !selected;
  moveButton.addEventListener('click', () => openSessions('move'));
  hints.append(moveButton);
  el('preview-index').textContent = index >= 0 ? `${index + 1} / ${choices.length}` : '—';
  // Only scroll the list: scrollIntoView can also move the whole page when
  // navigating a long list near the bottom of the viewport.
  if (activeRow) {
    const row = activeRow.getBoundingClientRect();
    const list = resultsNode.getBoundingClientRect();
    if (row.top < list.top) resultsNode.scrollTop += row.top - list.top;
    else if (row.bottom > list.bottom) resultsNode.scrollTop += row.bottom - list.bottom;
  }
  if (choice?.history) renderHistoryPreview(choice.history);
  else renderPreview(choice?.tab);
}

function updateQueryAction(): void {
  const action = queryAction(input.value);
  el('query-action').hidden = Boolean(sessionMode) || !action;
  const button = el<HTMLButtonElement>('query-action-button');
  button.disabled = busy || !action || action.kind === 'invalid';
  const label = !action ? '' : action.kind === 'address' ? `Open ${new URL(action.url).host}` : action.kind === 'search' ? 'Search the web' : 'Check the address';
  el('query-action-label').textContent = label;
  button.title = !action ? '' : action.kind === 'address' ? action.url : action.kind === 'search' ? `Search with your browser's default engine: ${action.query}` : action.reason;
  button.setAttribute('aria-label', button.title || label);
  const binding = Object.entries(settings.keymap[mode]).find(([, value]) => value === 'launchQuery')?.[0];
  el('query-action-key').textContent = binding ?? '';
  el('query-action-key').hidden = !binding;
}

function renderHistoryPreview(item: HistorySuggestion): void {
  pagePreview.invalidate();
  const preview = el('preview'); preview.replaceChildren();
  if (!settings.showPreview) return;
  const summary = node('div', 'preview-summary');
  const title = node('h2', 'preview-title', item.title); title.title = item.title;
  const url = node('p', 'preview-url', item.url); url.title = item.url;
  summary.append(node('span', 'preview-domain', domain(item.url)), title, url);
  const note = node('div', 'history-preview-note', 'From your browsing history. Open this page in a new tab.');
  const actions = node('div', 'preview-actions');
  const open = node('button', 'primary', 'Open in new tab ↵');
  open.addEventListener('click', () => void execute('accept')); actions.append(open);
  preview.append(summary, note, actions);
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
  if (!choices.length) return;
  const index = choices.findIndex(result => result.id === selectedId);
  selectedId = choices[(index + delta + choices.length) % choices.length].id;
  updateSelection();
}

async function execute(action: Action): Promise<void> {
  if (busy) return;
  if (action === 'switchSession') { if (sessionMode) leaveSessions(); else openSessions('switch'); return; }
  if (action === 'moveSession') { if (!sessionMode) openSessions('move'); return; }
  if (sessionMode) {
    if (action === 'cancel' || action === 'normal') { leaveSessions(); return; }
    if (action === 'accept') { await acceptSession(); return; }
    if (!['next', 'previous', 'first', 'last', 'help', 'insert'].includes(action)) return;
  }
  if (action === 'launchQuery') {
    const plan = queryAction(input.value);
    if (!plan) return;
    if (plan.kind === 'invalid') { message(plan.reason, true); return; }
  }
  switch (action) {
    case 'next': move(1); return;
    case 'previous': move(-1); return;
    case 'normal': setMode('normal'); return;
    case 'insert': setMode('insert'); return;
    case 'first': selectedId = choices[0]?.id; updateSelection(); return;
    case 'last': selectedId = choices.at(-1)?.id; updateSelection(); return;
    case 'help': showHelp(); return;
    case 'scope': scope = scope === 'all' ? 'window' : 'all'; render(); return;
    case 'allTabs': setTabFilter('all'); return;
    case 'pinnedTabs': setTabFilter('pinned'); return;
    case 'markNext': case 'markPrevious':
      if (typeof selectedId === 'number') {
        if (marks.has(selectedId)) marks.delete(selectedId); else marks.add(selectedId);
        move(action === 'markNext' ? 1 : -1); render();
      }
      return;
  }
  const historyItem = choices.find(choice => choice.id === selectedId)?.history;
  if (historyItem && (action === 'close' || action === 'pin')) return;
  if (action !== 'cancel' && action !== 'launchQuery' && selectedId === undefined && !marks.size) return;
  busy = true;
  updateQueryAction();
  try {
    let updated: Snapshot | undefined;
    if (action === 'launchQuery') updated = await request({ type: 'launch-query', query: input.value });
    else if (action === 'accept' && historyItem) updated = await request({ type: 'open-history', url: historyItem.url });
    else if (action === 'accept' && typeof selectedId === 'number') updated = await request({ type: 'select', id: selectedId });
    else if (action === 'cancel') updated = await request({ type: 'return' });
    else if (action === 'pin' && typeof selectedId === 'number') updated = await request({ type: 'pin', id: selectedId });
    else if (action === 'close') {
      const ids = marks.size ? [...marks] : typeof selectedId === 'number' ? [selectedId] : [];
      if (!ids.length) return;
      if ((ids.length > 1 || snapshot.tabs.some(tab => ids.includes(tab.id) && tab.pinned)) &&
        !window.confirm(`Close ${ids.length} tab(s)?${snapshot.tabs.some(tab => ids.includes(tab.id) && tab.pinned) ? ' Includes pinned tabs.' : ''}`)) return;
      updated = await request({ type: 'close', ids });
      marks.clear();
      message(`Closed ${ids.length} tab(s). Undo: Ctrl+Shift+T.`);
    }
    if (updated) { snapshot = updated; render(); }
  } catch (error) {
    historySearch.reset();
    await refresh();
    message(error instanceof Error ? error.message : String(error), true);
  } finally { busy = false; updateQueryAction(); }
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
  el<HTMLInputElement>('session-auto').checked = snapshot.workSessions?.autoAssign !== false;
  el<HTMLInputElement>('history-suggestions').checked = value.historySuggestions;
  el<HTMLInputElement>('history-suggestions').disabled = snapshot.private;
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

input.addEventListener('input', () => {
  selectedId = undefined;
  if (el('status').classList.contains('error')) message('');
  render();
});
document.addEventListener('keydown', event => {
  if (event.isComposing || event.key === 'Process' || helpDialog.open || settingsDialog.open || sessionNameDialog.open) return;
  if (sessionMode && event.key === 'Escape') { event.preventDefault(); leaveSessions(); return; }
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
  selectedId = row.dataset.history || sessionMode ? row.dataset.key : Number(row.dataset.id);
  updateSelection();
  void execute('accept');
});
el('scope-all').addEventListener('click', () => { scope = 'all'; render(); input.focus(); });
el('scope-window').addEventListener('click', () => { scope = 'window'; render(); input.focus(); });
el('filter-all').addEventListener('click', () => { setTabFilter('all'); input.focus({ preventScroll: true }); });
el('filter-pinned').addEventListener('click', () => { setTabFilter('pinned'); input.focus({ preventScroll: true }); });
el('help-button').addEventListener('click', showHelp);
el('sessions-button').addEventListener('click', () => { if (sessionMode) leaveSessions(); else openSessions('switch'); });
el('query-action-button').addEventListener('click', () => void execute('launchQuery'));
el('layout-button').addEventListener('click', () => void toggleView('layout'));
el('preview-button').addEventListener('click', () => void toggleView('showPreview'));
el('settings-button').addEventListener('click', () => { fillSettings(settings); settingsDialog.showModal(); });
el('history-suggestions').addEventListener('change', async () => {
  const checkbox = el<HTMLInputElement>('history-suggestions');
  if (!checkbox.checked) return;
  if (!extension || snapshot.private) { checkbox.checked = false; return; }
  permissionPending = true; checkbox.disabled = true;
  try {
    // Request directly from this user gesture, before any other await.
    if (!await browser.permissions.request({ permissions: ['history'] })) {
      checkbox.checked = false; el('settings-error').textContent = 'History permission was not granted.';
    }
    else el('settings-error').textContent = '';
  } catch { checkbox.checked = false; el('settings-error').textContent = 'Could not enable history. Try again from Settings.'; }
  finally { permissionPending = false; checkbox.disabled = false; }
});
el('reset-settings').addEventListener('click', () => fillSettings(defaultSettings));
el('shortcut-settings').addEventListener('click', () => {
  if (extension) void browser.commands.openShortcutSettings().catch(() => { el('settings-error').textContent = 'Open about:addons → gear menu → Manage Extension Shortcuts.'; });
  else el('settings-error').textContent = 'Available when loaded as a Firefox extension.';
});
for (const dialog of [helpDialog, settingsDialog, sessionNameDialog]) {
  dialog.querySelector('.dialog-close')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => input.focus());
}
el('settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    if (permissionPending) throw new Error('Finish the browser permission prompt before saving.');
    const keymap: unknown = JSON.parse(el<HTMLTextAreaElement>('keymap').value);
    if (!validateKeymap(keymap)) throw new Error('Expected insert and normal objects mapping keys to known actions.');
    const historySuggestions = el<HTMLInputElement>('history-suggestions').checked;
    if (historySuggestions && extension && !await browser.permissions.contains({ permissions: ['history'] })) {
      throw new Error('Enable history permission by switching Suggest visited sites off and on.');
    }
    const next = readSettings({ ...settings, historySuggestions, layout: el('settings-form').dataset.layout, showPreview: el('settings-form').dataset.preview !== 'false', keymapVersion: 4, theme: el<HTMLSelectElement>('theme').value, scope: el<HTMLSelectElement>('default-scope').value, keymap });
    const updated = await request({ type: 'session-auto', enabled: el<HTMLInputElement>('session-auto').checked });
    if (updated) snapshot = updated;
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
    else if (message?.type === 'history-changed') { historySearch.reset(); render(); }
    else if (message?.type === 'changed') scheduleRefresh();
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) { settings = readSettings(changes.settings.newValue); historySearch.reset(); applyTheme(); render(); }
    if (changes.tabFilter) { tabFilter = readTabFilter(changes.tabFilter.newValue); render(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { if (sessionMode) leaveSessions(); input.value = ''; selectedId = undefined; marks.clear(); setMode('insert'); scheduleRefresh(); }
  });
  window.addEventListener('focus', () => { scheduleRefresh(); if (!helpDialog.open && !settingsDialog.open && !sessionNameDialog.open) input.focus(); });
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
