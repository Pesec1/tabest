// Narrow contracts for the Firefox APIs this extension uses. Keep this surface
// aligned with MDN WebExtensions.
declare namespace browser {
  namespace tabs {
    interface Tab {
      id?: number;
      windowId: number;
      url?: string;
      pendingUrl?: string;
      title?: string;
      favIconUrl?: string;
      active: boolean;
      pinned: boolean;
      incognito: boolean;
      lastAccessed?: number;
      audible?: boolean;
      mutedInfo?: { muted: boolean };
      discarded?: boolean;
      hidden?: boolean;
      cookieStoreId?: string;
      openerTabId?: number;
      index?: number;
    }
    function get(id: number): Promise<Tab>;
    function getCurrent(): Promise<Tab | undefined>;
    function query(query: { windowId?: number; active?: boolean }): Promise<Tab[]>;
    function create(options: { windowId?: number; url?: string; active?: boolean; openerTabId?: number; index?: number }): Promise<Tab>;
    function update(id: number, changes: { active?: boolean; pinned?: boolean; openerTabId?: number }): Promise<Tab>;
    function remove(id: number): Promise<void>;
    function captureTab(id: number, options: { format: 'jpeg'; quality: number; scale: number }): Promise<string>;
    const onActivated: BrowserEvent<(info: { tabId: number; windowId: number }) => void>;
    const onRemoved: BrowserEvent<(tabId: number) => void>;
    const onUpdated: BrowserEvent<(tabId: number, changes: { url?: string; status?: string; discarded?: boolean }) => void>;
    const onCreated: BrowserEvent<(tab: Tab) => void>;
    const onAttached: BrowserEvent<(tabId: number) => void>;
    const onDetached: BrowserEvent<() => void>;
  }
  namespace windows {
    interface Window { id?: number; incognito: boolean }
    function get(id: number): Promise<Window>;
    function getLastFocused(): Promise<Window>;
    function update(id: number, changes: { focused: boolean }): Promise<Window>;
    const onRemoved: BrowserEvent<(windowId: number) => void>;
  }
  namespace sessions {
    function getTabValue(id: number, key: string): Promise<unknown>;
    function setTabValue(id: number, key: string, value: unknown): Promise<void>;
    function getWindowValue(id: number, key: string): Promise<unknown>;
    function setWindowValue(id: number, key: string, value: unknown): Promise<void>;
  }
  namespace storage {
    interface Area {
      get(key: string): Promise<Record<string, unknown>>;
      set(values: Record<string, unknown>): Promise<void>;
    }
    const local: Area;
    const session: Area;
    const onChanged: BrowserEvent<(changes: Record<string, { newValue?: unknown }>, area: string) => void>;
  }
  namespace runtime {
    const id: string;
    function getURL(path: string): string;
    function sendMessage(message: unknown): Promise<unknown>;
    const onMessage: BrowserEvent<(message: any, sender: { tab?: tabs.Tab; url?: string; id?: string }) => void | Promise<unknown>>;
  }
  namespace commands {
    function openShortcutSettings(): Promise<void>;
    const onCommand: BrowserEvent<(command: string, tab?: tabs.Tab) => void>;
  }
  namespace search {
    function search(options: { query: string; tabId: number }): Promise<void>;
  }
  namespace permissions {
    function contains(permissions: { origins?: string[]; permissions?: string[] }): Promise<boolean>;
    function request(permissions: { permissions: string[] }): Promise<boolean>;
    const onAdded: BrowserEvent<() => void>;
    const onRemoved: BrowserEvent<() => void>;
  }
  namespace history {
    interface HistoryItem { id: string; url?: string; title?: string; lastVisitTime?: number; visitCount?: number; typedCount?: number }
    function search(query: { text: string; startTime: number; maxResults: number }): Promise<HistoryItem[]>;
    const onVisitRemoved: BrowserEvent<() => void>;
  }
  namespace action {
    const onClicked: BrowserEvent<(tab: tabs.Tab) => void>;
  }
}
interface BrowserEvent<T> { addListener(listener: T): void }
