// Paste into the extension's BACKGROUND console in about:debugging.
// Observe one reproduction, then run: tabestTrace.stop()
// Export with: JSON.stringify(tabestTrace.read(), null, 2)
// No titles, URLs, screenshots, or browsing data are exported or persisted.
(() => {
  globalThis.tabestTrace?.stop();
  if (globalThis.telescopeTrace !== globalThis.tabestTrace) globalThis.telescopeTrace?.stop();
  const records = [];
  const pages = new Map();
  const listeners = [];
  const restorers = [];
  const started = Date.now();
  let sequence = 0;
  let stopped = false;
  const page = url => {
    if (!url) return undefined;
    if (url.split(/[?#]/)[0] === browser.runtime.getURL('picker.html')) return 'picker';
    if (!pages.has(url)) pages.set(url, `page-${pages.size + 1}`);
    return pages.get(url);
  };
  const tab = value => value && ({
    id: value.id, windowId: value.windowId, page: page(value.url ?? value.pendingUrl),
    active: value.active, hidden: value.hidden, discarded: value.discarded,
    pinned: value.pinned, openerTabId: value.openerTabId, index: value.index,
  });
  const record = (event, details) => {
    if (stopped) return;
    records.push({ n: ++sequence, ms: Date.now() - started, event, ...details });
    if (records.length > 700) records.shift();
  };
  const query = browser.tabs.query.bind(browser.tabs);
  const snapshot = reason => {
    void query({}).then(tabs => record('snapshot', { reason, tabs: tabs.map(tab) }),
      () => record('snapshot-error', { reason }));
  };
  const listen = (event, callback) => {
    event.addListener(callback);
    listeners.push(() => event.removeListener(callback));
  };
  for (const name of ['remove', 'update', 'create', 'captureTab']) {
    const original = browser.tabs[name];
    const wrapper = async function (...args) {
      const operation = ++sequence;
      const options = name === 'create' ? args[0] : args[1];
      record(`call:${name}`, {
        operation, ids: name === 'create' ? undefined : args[0],
        options: options && {
          active: options.active, pinned: options.pinned, windowId: options.windowId,
          openerTabId: options.openerTabId, page: page(options.url), index: options.index,
        },
      });
      try {
        const result = await original.apply(browser.tabs, args);
        record(`result:${name}`, { operation, tab: name === 'create' || name === 'update' ? tab(result) : undefined });
        if (name !== 'captureTab') snapshot(`after:${name}:${operation}`);
        return result;
      } catch (error) {
        // Error messages can contain addresses; omit their text from reports.
        record(`error:${name}`, { operation });
        throw error;
      }
    };
    browser.tabs[name] = wrapper;
    restorers.push(() => { if (browser.tabs[name] === wrapper) browser.tabs[name] = original; });
  }
  listen(browser.tabs.onCreated, value => { record('created', { tab: tab(value) }); snapshot('created'); });
  listen(browser.tabs.onRemoved, (id, info) => { record('removed', { id, ...info }); snapshot('removed'); });
  listen(browser.tabs.onActivated, info => { record('activated', info); snapshot('activated'); });
  listen(browser.tabs.onUpdated, (id, changes, value) => {
    if (changes.url || changes.status || changes.hidden !== undefined || changes.discarded !== undefined) {
      record('updated', { id, tab: tab(value), status: changes.status });
    }
  });
  listen(browser.commands.onCommand, (command, value) => record('command', { command, tab: tab(value) }));
  const trace = {
    read: () => ({ version: browser.runtime.getManifest().version, stopped, records: structuredClone(records) }),
    stop: () => {
      if (!stopped) {
        record('trace-stopped', {});
        stopped = true;
        listeners.forEach(remove => remove());
        restorers.forEach(restore => restore());
        pages.clear();
      }
      return 'Trace stopped. Export with JSON.stringify(tabestTrace.read(), null, 2)';
    },
  };
  record('trace-started', {});
  snapshot('initial');
  globalThis.tabestTrace = trace;
  // Retain the old console handle for previously supplied diagnostic instructions.
  globalThis.telescopeTrace = trace;
  console.info('Tabest trace enabled. Reproduce once, run tabestTrace.stop(), then JSON.stringify(tabestTrace.read(), null, 2).');
})();
