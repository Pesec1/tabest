import type { Request, Snapshot, TabItem } from './model.ts';
import { historyUrl } from './history-suggestions.ts';

type Api = Pick<typeof browser, 'tabs' | 'windows' | 'storage' | 'runtime'>;
interface PickerSession { pickerId: number; originId?: number }
interface SavedState {
  sessions: Record<string, PickerSession>;
  recency: Record<string, number>;
  closingIds?: number[];
  pickerIds?: number[];
}

export class TabController {
  private sessions: Record<string, PickerSession> = {};
  private recency: Record<string, number> = {};
  private closingIds = new Set<number>();
  private pickerIds = new Set<number>();
  private removalObservers = new Map<number, () => void>();
  private pickerUrl: string;
  private api: Api;
  private closeTimeout: number;
  private opened?: (tab: browser.tabs.Tab) => Promise<void>;
  private accepted?: (tab: browser.tabs.Tab, callerWindowId: number) => Promise<void>;
  constructor(api: Api, closeTimeout = 3000, opened?: (tab: browser.tabs.Tab) => Promise<void>, accepted?: (tab: browser.tabs.Tab, callerWindowId: number) => Promise<void>) {
    this.api = api; this.closeTimeout = closeTimeout; this.pickerUrl = api.runtime.getURL('picker.html');
    this.opened = opened;
    this.accepted = accepted;
  }

  private hasPickerUrl(tab: browser.tabs.Tab): boolean {
    return [tab.url, tab.pendingUrl].some(url => url?.split(/[?#]/)[0] === this.pickerUrl);
  }

  isPicker(tab: browser.tabs.Tab): boolean {
    return this.hasPickerUrl(tab) || (tab.id !== undefined && this.pickerIds.has(tab.id));
  }

  isClosing(tabId: number | undefined): boolean {
    return tabId !== undefined && this.closingIds.has(tabId);
  }

  async initialize(): Promise<void> {
    const stored = (await this.api.storage.session.get('state')).state as SavedState | undefined;
    this.sessions = stored?.sessions ?? {};
    this.recency = stored?.recency ?? {};
    this.closingIds = new Set(stored?.closingIds ?? []);
    const tabs = await this.api.tabs.query({});
    const remembered = new Set([
      ...(stored?.pickerIds ?? []), ...Object.values(this.sessions).map(session => session.pickerId),
    ]);
    this.pickerIds = new Set(tabs.filter(tab => tab.id !== undefined && (
      this.hasPickerUrl(tab) || (remembered.has(tab.id) && (!tab.url || tab.url === 'about:blank'))
    )).map(tab => tab.id!));
    const ids = new Set(tabs.map(tab => tab.id));
    // A suspended background can restart within the same browser session.
    // Keep tombstones even when a closed ID is absent from this one snapshot.
    for (const [windowId, session] of Object.entries(this.sessions)) {
      if (!tabs.some(tab => tab.id === session.pickerId && this.isPicker(tab))) delete this.sessions[windowId];
    }
    for (const id of Object.keys(this.recency)) if (!ids.has(Number(id))) delete this.recency[id];
    for (const tab of tabs) {
      if (tab.id !== undefined && !this.isPicker(tab)) this.recency[tab.id] ??= tab.lastAccessed ?? 0;
    }
    await this.save();
  }

  private async save(): Promise<void> {
    await this.api.storage.session.set({ state: {
      sessions: this.sessions, recency: this.recency, closingIds: [...this.closingIds], pickerIds: [...this.pickerIds],
    } });
  }

  async toggle(windowId?: number, sourceTab?: browser.tabs.Tab): Promise<void> {
    const targetWindowId = sourceTab?.windowId ?? windowId;
    const window = targetWindowId === undefined ? await this.api.windows.getLastFocused() : await this.api.windows.get(targetWindowId);
    if (window.id === undefined) return;
    // Command events carry the invocation tab. Re-querying the active tab
    // after waiting in the event queue can turn a close into another open.
    const active = sourceTab ?? (await this.api.tabs.query({ windowId: window.id, active: true }))[0];
    if (active?.id === undefined || active.id < 0) return;
    if (this.closingIds.has(active.id)) return;
    if (sourceTab && !(await this.api.tabs.get(active.id).catch(() => undefined))) return;
    const pickers = (await this.api.tabs.query({ windowId: window.id })).filter(tab =>
      this.isPicker(tab) && tab.id !== undefined && !this.closingIds.has(tab.id),
    );
    if (this.isPicker(active)) {
      // Clean up duplicate service tabs left by earlier versions first.
      for (const picker of pickers) if (picker.id !== active.id) await this.closePicker(window.id, picker.id!);
      await this.closePicker(window.id, active.id);
      return;
    }
    const existing = pickers.find(tab => tab.id === this.sessions[window.id!]?.pickerId) ?? pickers[0];
    if (existing?.id) {
      this.pickerIds.add(existing.id);
      this.sessions[window.id] = { pickerId: existing.id, originId: active.id };
      await this.save();
      await this.api.tabs.update(existing.id, { active: true, openerTabId: active.id });
      for (const picker of pickers) if (picker.id !== existing.id) await this.closePicker(window.id, picker.id!);
    } else {
      const tab = await this.api.tabs.create({
        windowId: window.id, url: this.pickerUrl, active: true, openerTabId: active.id,
        ...(active.index === undefined ? {} : { index: active.index + 1 }),
      });
      if (tab.id === undefined || tab.id < 0) throw new Error('The browser did not provide a valid picker tab ID.');
      this.pickerIds.add(tab.id);
      this.sessions[window.id] = { pickerId: tab.id!, originId: active.id };
      await this.save();
    }
  }

  async activated(tabId: number): Promise<void> {
    const tab = await this.api.tabs.get(tabId).catch(() => undefined);
    if (!tab || this.isPicker(tab) || this.closingIds.has(tabId)) return;
    this.recency[tabId] = Date.now();
    await this.save();
  }

  async removed(tabId: number): Promise<void> {
    this.observeRemoval(tabId);
    delete this.recency[tabId];
    // Zen may retain a native reference after onRemoved. Never reuse that ID
    // for a later hotkey, even if a stale query still contains it.
    this.closingIds.add(tabId);
    this.pickerIds.delete(tabId);
    for (const [windowId, session] of Object.entries(this.sessions)) {
      if (session.pickerId === tabId) delete this.sessions[windowId];
      else if (session.originId === tabId) delete session.originId;
    }
    await this.save();
  }

  observeRemoval(tabId: number): void {
    this.removalObservers.get(tabId)?.();
  }

  private async removeConfirmed(tabId: number): Promise<void> {
    let observed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const removed = new Promise<void>(resolve => {
      this.removalObservers.set(tabId, () => { observed = true; resolve(); });
    });
    try {
      await this.api.tabs.remove(tabId);
      if (observed || !await this.api.tabs.get(tabId).catch(() => undefined)) return;
      // remove() can resolve before animation/beforeunload completes. The UI
      // must not claim success or permit the next queued selection yet.
      await Promise.race([
        removed,
        new Promise<void>(resolve => { timer = setTimeout(resolve, this.closeTimeout); }),
      ]);
      if (!observed && await this.api.tabs.get(tabId).catch(() => undefined)) {
        throw new Error('The browser has not finished closing this tab. Confirm any page dialog and try again.');
      }
    } finally {
      clearTimeout(timer);
      this.removalObservers.delete(tabId);
    }
  }

  async navigated(tabId: number, url: string): Promise<void> {
    if (!this.pickerIds.has(tabId) || !url || url === 'about:blank' || url.split(/[?#]/)[0] === this.pickerUrl) return;
    this.pickerIds.delete(tabId);
    for (const [windowId, session] of Object.entries(this.sessions)) {
      if (session.pickerId === tabId) delete this.sessions[windowId];
    }
    await this.save();
  }

  async snapshot(windowId: number): Promise<Snapshot> {
    const window = await this.api.windows.get(windowId);
    const originId = this.sessions[windowId]?.originId;
    const tabs: TabItem[] = (await this.api.tabs.query({})).filter(tab =>
      tab.id !== undefined && tab.id >= 0 && !this.closingIds.has(tab.id) &&
      !this.isPicker(tab) && Boolean(tab.incognito) === Boolean(window.incognito),
    ).map(tab => ({
      id: tab.id!, windowId: tab.windowId, title: tab.title || tab.url || 'Untitled',
      url: tab.url ?? '', lastUsed: this.recency[tab.id!] ?? tab.lastAccessed ?? 0,
      favIconUrl: tab.favIconUrl,
      pinned: tab.pinned, audible: Boolean(tab.audible), muted: Boolean(tab.mutedInfo?.muted),
      discarded: Boolean(tab.discarded), origin: tab.id === originId,
      container: tab.cookieStoreId && tab.cookieStoreId !== 'firefox-default' ? tab.cookieStoreId : undefined,
    }));
    return { tabs, windowId, private: Boolean(window.incognito) };
  }

  async closePicker(windowId: number, pickerId: number): Promise<void> {
    if (this.closingIds.has(pickerId)) return;
    const picker = await this.api.tabs.get(pickerId).catch(() => undefined);
    if (!picker || picker.windowId !== windowId || !this.isPicker(picker)) return;
    this.closingIds.add(pickerId);
    await this.save();
    try {
      const remaining = (await this.api.tabs.query({ windowId })).some(tab =>
        tab.id !== undefined && tab.id >= 0 && !this.isPicker(tab) &&
        !this.closingIds.has(tab.id) && !tab.hidden,
      );
      // Keep the window alive if the picker is the last visible tab.
      if (!remaining) await this.api.tabs.create({ windowId, active: false });
      // Let Zen choose the successor using its live tab/workspace state.
      // Never activate historical tab IDs on cancellation: Zen can retain
      // references to tabs that the user has already closed.
      await this.removeConfirmed(pickerId);
      if (this.sessions[windowId]?.pickerId === pickerId) delete this.sessions[windowId];
      await this.save();
    } catch (error) {
      this.closingIds.delete(pickerId);
      await this.save();
      throw error;
    }
  }

  private async focus(target: TabItem, callerWindowId: number): Promise<void> {
    if (this.closingIds.has(target.id)) throw new Error('This tab is being closed.');
    const current = await this.api.tabs.get(target.id);
    if (current.url !== target.url || current.windowId !== target.windowId) {
      throw new Error('This tab changed. Please select it again.');
    }
    const tab = await this.api.tabs.update(target.id, { active: true });
    // Same-window selection needs no window activation. In Zen, refocusing
    // a window can also run its workspace/window synchronization handlers.
    if (tab.windowId !== callerWindowId) await this.api.windows.update(tab.windowId, { focused: true });
    await this.accepted?.(tab, callerWindowId);
  }

  async openHistory(url: string, caller: browser.tabs.Tab): Promise<Snapshot> {
    if (!historyUrl(url) || caller.incognito || (await this.api.windows.get(caller.windowId)).incognito) {
      throw new Error('History suggestions are unavailable in this window.');
    }
    const snapshot = await this.snapshot(caller.windowId);
    const existing = snapshot.tabs.find(tab => historyUrl(tab.url) === historyUrl(url));
    if (existing) await this.focus(existing, caller.windowId);
    else {
      const tab = await this.api.tabs.create({ windowId: caller.windowId, url, active: true, openerTabId: caller.id });
      await this.opened?.(tab);
    }
    return this.snapshot(caller.windowId);
  }

  async request(request: Request, senderTab: browser.tabs.Tab): Promise<Snapshot | undefined> {
    const windowId = senderTab.windowId;
    if (request.type === 'snapshot') return this.snapshot(windowId);
    if (request.type === 'return') {
      if (senderTab.id !== undefined) await this.closePicker(windowId, senderTab.id);
      return;
    }
    const snapshot = await this.snapshot(windowId);
    if (request.type === 'close') {
      if (!Array.isArray(request.ids) || !request.ids.every(Number.isInteger)) throw new Error('Invalid tab selection.');
      const allowed = new Set(snapshot.tabs.map(tab => tab.id));
      const ids = [...new Set(request.ids)];
      if (ids.some(id => !allowed.has(id))) throw new Error('A selected tab is no longer available.');
      // Firefox/Zen can resolve remove() before the native closing animation
      // finishes. Exclude these IDs immediately, before onRemoved arrives.
      ids.forEach(id => this.closingIds.add(id));
      const origins = new Map(Object.values(this.sessions).map(session => [session, session.originId]));
      for (const session of Object.values(this.sessions)) {
        if (session.originId !== undefined && ids.includes(session.originId)) delete session.originId;
      }
      await this.save();
      const failures: number[] = [];
      for (const id of ids) {
        try { await this.removeConfirmed(id); }
        catch {
          const stillOpen = await this.api.tabs.get(id).catch(() => undefined);
          if (stillOpen) { this.closingIds.delete(id); failures.push(id); }
        }
      }
      for (const [session, originId] of origins) {
        if (originId !== undefined && failures.includes(originId)) session.originId = originId;
      }
      await this.save();
      if (failures.length) throw new Error(`Could not close ${failures.length} tab(s). Please try again.`);
    } else if (request.type === 'select' || request.type === 'pin') {
      const target = snapshot.tabs.find(tab => tab.id === request.id);
      if (!target) throw new Error('This tab is no longer available. Refreshing results.');
      if (request.type === 'select') await this.focus(target, windowId);
      else await this.api.tabs.update(target.id, { pinned: !target.pinned });
    } else throw new Error('Unknown action.');
    return this.snapshot(windowId);
  }
}
