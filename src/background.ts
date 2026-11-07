import { TabController } from './controller.ts';
import type { Reply, Request } from './model.ts';
import { TabPreviews } from './previews.ts';

const controller = new TabController(browser);
const previews = new TabPreviews(browser, tab => controller.isPicker(tab) || controller.isClosing(tab.id));
// One queue covers initialization and browser events, including rapid hotkey presses.
let queue: Promise<unknown> = controller.initialize().catch(error => { console.error('Tabest initialization:', error); });
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
  // Signal completion immediately, outside the queue: the close operation
  // may currently be waiting for this very event before it releases the queue.
  controller.observeRemoval(tabId);
  previews.invalidate(tabId);
  notifyPreview(tabId);
  void enqueue(async () => { await controller.removed(tabId); notify(); });
});
browser.tabs.onUpdated.addListener((tabId, changes) => {
  if (changes.url || changes.status || changes.discarded !== undefined) {
    previews.invalidate(tabId); notifyPreview(tabId);
  }
  if (changes.url) void enqueue(async () => { await controller.navigated(tabId, changes.url!); notify(); });
  else notify();
});
browser.tabs.onCreated.addListener(() => notify());
browser.tabs.onAttached.addListener(() => notify());
browser.tabs.onDetached.addListener(() => notify());
browser.permissions.onRemoved.addListener(() => { previews.clear(); notifyPreview(); });
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
      if (message.type === 'close' && 'ids' in message && Array.isArray(message.ids)) {
        for (const id of message.ids) if (typeof id === 'number') previews.invalidate(id);
      }
      const snapshot = await controller.request(message as Request, tab);
      return { ok: true, snapshot };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'The action failed.' };
    }
  };
  // Slow captures run independently from the queue protecting tab lifecycles.
  return message && typeof message === 'object' && 'type' in message && message.type === 'preview'
    ? handle() : enqueue(handle);
});
