import type { Request, Snapshot, WorkSession } from './model.ts';

export const ALL_SESSIONS = 'all';
export const UNASSIGNED = '';
const membershipKey = 'tabest.workSession';
const activeKey = 'tabest.activeWorkSession';
interface Catalog { sessions: WorkSession[]; autoAssign: boolean }
interface PrivateState { catalog: Catalog; tabs: Record<number, string | string[]>; windows: Record<number, string> }
type Api = Pick<typeof browser, 'tabs' | 'windows' | 'sessions' | 'storage'>;
const emptyCatalog = (): Catalog => ({ sessions: [], autoAssign: true });

function readCatalog(value: unknown): Catalog {
  const stored = value as Partial<Catalog> | undefined;
  const ids = new Set<string>();
  const sessions = (Array.isArray(stored?.sessions) ? stored.sessions : []).filter((item): item is WorkSession => {
    if (!item || typeof item.id !== 'string' || !item.id || item.id === 'unsorted' || item.id === ALL_SESSIONS || ids.has(item.id) ||
      typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80) return false;
    ids.add(item.id); return true;
  }).map(item => ({ id: item.id, name: item.name }));
  return { sessions, autoAssign: stored?.autoAssign !== false };
}

// Called only in the background's lifecycle queue. Membership follows tabs,
// never URLs or ephemeral tab IDs in persistent extension storage.
export class WorkSessions {
  private api: Api;
  private excluded: (tab: browser.tabs.Tab) => boolean;
  private normal = emptyCatalog();
  private privateState: PrivateState = { catalog: emptyCatalog(), tabs: {}, windows: {} };
  private members = new Map<number, string[]>();
  private active = new Map<number, string>();
  constructor(api: Api, excluded: (tab: browser.tabs.Tab) => boolean) { this.api = api; this.excluded = excluded; }

  async initialize(): Promise<void> {
    this.normal = readCatalog((await this.api.storage.local.get('workSessions')).workSessions);
    const saved = (await this.api.storage.session.get('privateWorkSessions')).privateWorkSessions as Partial<PrivateState> | undefined;
    this.privateState = { catalog: readCatalog(saved?.catalog), tabs: saved?.tabs ?? {}, windows: saved?.windows ?? {} };
    const tabs = await this.api.tabs.query({});
    const ids = new Set(tabs.filter(tab => tab.incognito).map(tab => tab.id));
    const windows = new Set(tabs.filter(tab => tab.incognito).map(tab => tab.windowId));
    for (const id of Object.keys(this.privateState.tabs)) if (!ids.has(Number(id))) delete this.privateState.tabs[Number(id)];
    for (const id of Object.keys(this.privateState.windows)) if (!windows.has(Number(id))) delete this.privateState.windows[Number(id)];
    if (!windows.size) this.privateState = { catalog: emptyCatalog(), tabs: {}, windows: {} };
    await this.savePrivate();
    for (const tab of tabs) if (!this.excluded(tab)) await this.member(tab);
  }

  private catalog(incognito: boolean): Catalog { return incognito ? this.privateState.catalog : this.normal; }
  private valid(id: unknown, incognito: boolean): string {
    return typeof id === 'string' && this.catalog(incognito).sessions.some(session => session.id === id) ? id : UNASSIGNED;
  }
  private memberships(value: unknown, incognito: boolean): string[] {
    // Older versions stored one string. Read both formats without losing data.
    const ids = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
    return [...new Set(ids.filter((id): id is string => typeof id === 'string' && Boolean(id) && this.valid(id, incognito) === id))];
  }
  private async savePrivate(): Promise<void> { await this.api.storage.session.set({ privateWorkSessions: this.privateState }); }
  private async saveCatalog(incognito: boolean, catalog: Catalog): Promise<void> {
    if (incognito) {
      await this.api.storage.session.set({ privateWorkSessions: { ...this.privateState, catalog } });
      this.privateState.catalog = catalog;
    } else {
      await this.api.storage.local.set({ workSessions: catalog });
      this.normal = catalog;
    }
  }
  private async member(tab: browser.tabs.Tab): Promise<string[]> {
    if (tab.id === undefined || this.excluded(tab)) return [];
    if (!this.members.has(tab.id)) {
      const saved = tab.incognito ? this.privateState.tabs[tab.id] : await this.api.sessions.getTabValue(tab.id, membershipKey);
      this.members.set(tab.id, this.memberships(saved, tab.incognito));
    }
    return this.memberships(this.members.get(tab.id), tab.incognito);
  }
  private async setMembers(tab: browser.tabs.Tab, ids: string[]): Promise<void> {
    if (tab.id === undefined || this.excluded(tab)) throw new Error('This tab is unavailable.');
    const memberships = this.memberships(ids, tab.incognito);
    if (tab.incognito) { this.privateState.tabs[tab.id] = memberships; await this.savePrivate(); }
    else await this.api.sessions.setTabValue(tab.id, membershipKey, memberships);
    this.members.set(tab.id, memberships);
  }
  private async current(windowId: number, incognito: boolean): Promise<string> {
    if (!this.active.has(windowId)) {
      const saved = incognito ? this.privateState.windows[windowId] : await this.api.sessions.getWindowValue(windowId, activeKey);
      this.active.set(windowId, this.valid(saved, incognito));
    }
    return this.valid(this.active.get(windowId), incognito) || ALL_SESSIONS;
  }
  private async setCurrent(windowId: number, incognito: boolean, id: string): Promise<void> {
    if (incognito) { this.privateState.windows[windowId] = id; await this.savePrivate(); }
    else await this.api.sessions.setWindowValue(windowId, activeKey, id);
    this.active.set(windowId, id);
  }

  async created(eventTab: browser.tabs.Tab): Promise<void> {
    if (eventTab.id === undefined) return;
    const tab = await this.api.tabs.get(eventTab.id).catch(() => undefined);
    if (!tab || this.excluded(tab)) return;
    // Undo-close/restored/duplicated tabs may already carry membership.
    const saved = tab.incognito ? this.privateState.tabs[tab.id!] : await this.api.sessions.getTabValue(tab.id!, membershipKey);
    if (saved !== undefined) { this.members.set(tab.id!, this.memberships(saved, tab.incognito)); return; }
    let ids: string[] = [];
    if (this.catalog(tab.incognito).autoAssign) {
      ids = [await this.current(tab.windowId, tab.incognito)];
      const opener = tab.openerTabId === undefined ? undefined : await this.api.tabs.get(tab.openerTabId).catch(() => undefined);
      if (opener && !this.excluded(opener) && Boolean(opener.incognito) === Boolean(tab.incognito)) ids = await this.member(opener);
    }
    await this.setMembers(tab, ids);
  }

  async opened(tab: browser.tabs.Tab): Promise<void> {
    await this.setMembers(tab, [await this.current(tab.windowId, tab.incognito)]);
  }

  async accepted(tab: browser.tabs.Tab, callerWindowId: number): Promise<void> {
    const caller = await this.api.windows.get(callerWindowId);
    if (Boolean(caller.incognito) !== Boolean(tab.incognito) || this.excluded(tab)) throw new Error('This tab is unavailable.');
    const id = await this.current(callerWindowId, tab.incognito);
    if (id === ALL_SESSIONS) return;
    const ids = await this.member(tab);
    if (!ids.includes(id)) await this.setMembers(tab, [...ids, id]);
  }

  async removed(tabId: number): Promise<void> {
    this.members.delete(tabId);
    if (Object.hasOwn(this.privateState.tabs, tabId)) { delete this.privateState.tabs[tabId]; await this.savePrivate(); }
  }
  async windowRemoved(windowId: number): Promise<void> {
    this.active.delete(windowId);
    delete this.privateState.windows[windowId];
    const tabs = await this.api.tabs.query({});
    if (!tabs.some(tab => tab.incognito)) this.privateState = { catalog: emptyCatalog(), tabs: {}, windows: {} };
    await this.savePrivate();
  }
  async decorate(snapshot: Snapshot): Promise<Snapshot> {
    const catalog = this.catalog(snapshot.private);
    const live = new Map((await this.api.tabs.query({})).map(tab => [tab.id, tab]));
    const tabs = [];
    for (const item of snapshot.tabs) {
      const tab = live.get(item.id);
      if (!tab || this.excluded(tab) || Boolean(tab.incognito) !== snapshot.private) continue;
      tabs.push({ ...item, sessionIds: await this.member(tab) });
    }
    return { ...snapshot, tabs, workSessions: {
      sessions: catalog.sessions,
      activeSessionId: await this.current(snapshot.windowId, snapshot.private), autoAssign: catalog.autoAssign,
    } };
  }
  private async selected(ids: unknown, caller: browser.tabs.Tab): Promise<browser.tabs.Tab[]> {
    if (!Array.isArray(ids) || !ids.every(Number.isInteger)) throw new Error('Invalid tab selection.');
    const tabs = await Promise.all([...new Set<number>(ids)].map(id => this.api.tabs.get(id)));
    if (tabs.some(tab => this.excluded(tab) || Boolean(tab.incognito) !== Boolean(caller.incognito))) throw new Error('A selected tab is unavailable.');
    return tabs;
  }
  private name(value: unknown, catalog: Catalog, except?: string): string {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Use a session name between 1 and 80 characters.');
    const name = value.trim();
    if (name.toLowerCase() === 'all sessions' || catalog.sessions.some(session => session.id !== except && session.name.toLowerCase() === name.toLowerCase())) throw new Error('A session with this name already exists.');
    return name;
  }
  async request(request: Request, caller: browser.tabs.Tab): Promise<void> {
    const incognito = Boolean((await this.api.windows.get(caller.windowId)).incognito);
    if (incognito !== Boolean(caller.incognito)) throw new Error('The window changed.');
    const catalog = this.catalog(incognito);
    if (request.type === 'session-create') {
      const name = this.name(request.name, catalog);
      const tabs = await this.selected(request.ids, caller);
      const id = crypto.randomUUID();
      await this.saveCatalog(incognito, { ...catalog, sessions: [...catalog.sessions, { id, name }] });
      for (const tab of tabs) await this.setMembers(tab, [id]);
      await this.setCurrent(caller.windowId, incognito, id);
    } else if (request.type === 'session-auto') {
      if (typeof request.enabled !== 'boolean') throw new Error('Invalid auto-add preference.');
      await this.saveCatalog(incognito, { ...catalog, autoAssign: request.enabled });
    } else if (request.type === 'session-new-tab') {
      // Explicit creation in a chosen session also works with auto-add disabled.
      const id = await this.current(caller.windowId, incognito);
      const tab = await this.api.tabs.create({ windowId: caller.windowId, active: false, openerTabId: caller.id });
      await this.setMembers(tab, [id]);
      await this.api.tabs.update(tab.id!, { active: true });
    } else if ('sessionId' in request) {
      const id = request.sessionId;
      if (typeof id !== 'string' || (id !== ALL_SESSIONS && (!id || this.valid(id, incognito) !== id))) throw new Error('This session no longer exists.');
      if (request.type === 'session-switch') await this.setCurrent(caller.windowId, incognito, id);
      else if (request.type === 'session-move') {
        const tabs = await this.selected(request.ids, caller);
        for (const tab of tabs) await this.setMembers(tab, [id]);
      } else if (request.type === 'session-rename') {
        if (id === ALL_SESSIONS) throw new Error('All sessions cannot be renamed.');
        const name = this.name(request.name, catalog, id);
        await this.saveCatalog(incognito, { ...catalog, sessions: catalog.sessions.map(session => session.id === id ? { id, name } : session) });
      } else if (request.type === 'session-delete') {
        if (id === ALL_SESSIONS) throw new Error('All sessions cannot be deleted.');
        // Deleted membership becomes unassigned; never recreate deleted sessions.
        await this.saveCatalog(incognito, { ...catalog, sessions: catalog.sessions.filter(session => session.id !== id) });
      } else throw new Error('Unknown session action.');
    } else throw new Error('Unknown session action.');
  }
}
