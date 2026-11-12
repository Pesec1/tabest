import { TabController } from './controller.ts';
import type { Reply, Request } from './model.ts';
import { TabPreviews } from './previews.ts';
import { HistorySuggestions } from './history-suggestions.ts';
import { QueryLauncher } from './query-launcher.ts';
import { WorkSessions } from './work-sessions.ts';

const controller: TabController = new TabController(browser, 3000, tab => workSessions.opened(tab), (tab, callerWindowId) => workSessions.accepted(tab, callerWindowId));
const previews = new TabPreviews(browser, tab => controller.isPicker(tab) || controller.isClosing(tab.id));
const history = new HistorySuggestions(browser);
const launcher = new QueryLauncher(browser, tab => workSessions.opened(tab));
const workSessions: WorkSessions = new WorkSessions(browser, tab => tab.id === undefined || tab.id < 0 || controller.isPicker(tab) || controller.isClosing(tab.id));
// One queue covers initialization and browser events, including rapid hotkey presses.
let queue: Promise<unknown> = controller.initialize().then(() => workSessions.initialize()).catch(error => { console.error('Tabest initialization:', error); });
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation);
  queue = result.catch(error => console.error('Tabest:', error));
  return result;
}

function notify(): void {
  void browser.runtime.sendMessage({ type: 'changed' }).catch(() => {});
}
function notifyPreview(id?: number): void {
  void browser.runtime.sendMessage({ type: 'preview-invalidated', id }).catch(() => {});
}

browser.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-picker') void enqueue(async () => { await controller.toggle(tab?.windowId, tab); notify(); });
});
browser.action.onClicked.addListener(tab => {
  void enqueue(async () => { await controller.toggle(tab.windowId, tab); notify(); });
});
browser.tabs.onActivated.addListener(({ tabId }) => {
  void enqueue(async () => { await controller.activated(tabId); notify(); });
});
browser.tabs.onRemoved.addListener(tabId => {
  history.forget(tabId);
  // Signal completion immediately, outside the queue: the close operation
  // may currently be waiting for this very event before it releases the queue.
  controller.observeRemoval(tabId);
  previews.invalidate(tabId);
  notifyPreview(tabId);
  void enqueue(async () => { await controller.removed(tabId); await workSessions.removed(tabId); notify(); });
});
browser.tabs.onUpdated.addListener((tabId, changes) => {
  if (changes.url || changes.status || changes.discarded !== undefined) {
    previews.invalidate(tabId); notifyPreview(tabId);
  }
  if (changes.url) void enqueue(async () => { await controller.navigated(tabId, changes.url!); notify(); });
  else notify();
});
browser.tabs.onCreated.addListener(tab => { void enqueue(async () => { await workSessions.created(tab); notify(); }); });
browser.tabs.onAttached.addListener(() => notify());
browser.tabs.onDetached.addListener(() => notify());
browser.windows.onRemoved.addListener(windowId => { void enqueue(() => workSessions.windowRemoved(windowId)); });
function clearHistory(): void {
  history.clear();
  void browser.runtime.sendMessage({ type: 'history-changed' }).catch(() => {});
}
let historyListening = false;
function listenHistory(): void {
  if (historyListening || typeof browser.history === 'undefined') return;
  browser.history.onVisitRemoved.addListener(clearHistory);
  historyListening = true;
}
listenHistory();
browser.permissions.onAdded.addListener(() => { listenHistory(); clearHistory(); });
browser.permissions.onRemoved.addListener(() => { historyListening = false; previews.clear(); notifyPreview(); clearHistory(); });
browser.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.settings) clearHistory(); });
browser.runtime.onMessage.addListener((message: unknown, sender) => {
  if (sender.id !== browser.runtime.id || sender.url?.split(/[?#]/)[0] !== browser.runtime.getURL('picker.html')) return;
  const handle = async (): Promise<Reply> => {
    try {
      if (!message || typeof message !== 'object' || !('type' in message)) throw new Error('Invalid request.');
      // Extension pages don't consistently receive sender.tab across browsers.
      // Resolve the caller's declared tab and verify it belongs to our picker.
      const callerId = sender.tab?.id ?? ('pickerId' in message ? message.pickerId : undefined);
      if (typeof callerId !== 'number') throw new Error('Picker tab is unavailable. Reload this tab.');
      const tab = await browser.tabs.get(callerId);
      if (!controller.isPicker(tab)) throw new Error('This action must originate from the picker.');
      if (message.type === 'preview' && 'id' in message && typeof message.id === 'number') {
        return { ok: true, preview: await previews.get(message.id, tab.windowId) };
      }
      if (message.type === 'history' && 'query' in message && typeof message.query === 'string') {
        return { ok: true, suggestions: await history.search(message.query, tab) };
      }
      if (message.type === 'open-history' && 'url' in message && typeof message.url === 'string') {
        const url = await history.resolve(message.url, tab);
        return { ok: true, snapshot: await workSessions.decorate(await controller.openHistory(url, tab)) };
      }
      if (message.type === 'launch-query' && 'query' in message && typeof message.query === 'string') {
        await launcher.launch(message.query, tab);
        return { ok: true };
      }
      if (message.type === 'close' && 'ids' in message && Array.isArray(message.ids)) {
        for (const id of message.ids) if (typeof id === 'number') previews.invalidate(id);
      }
      if (typeof message.type === 'string' && message.type.startsWith('session-')) {
        await workSessions.request(message as Request, tab);
        notify();
        return { ok: true, snapshot: await workSessions.decorate(await controller.snapshot(tab.windowId)) };
      }
      const snapshot = await controller.request(message as Request, tab);
      return { ok: true, snapshot: snapshot ? await workSessions.decorate(snapshot) : undefined };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'The action failed.' };
    }
  };
  // Indexed history reads and captures must not block tab actions or typing.
  return message && typeof message === 'object' && 'type' in message && (message.type === 'preview' || message.type === 'history')
    ? handle() : enqueue(handle);
});
