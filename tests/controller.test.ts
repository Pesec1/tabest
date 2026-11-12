import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TabController } from '../src/controller.ts';

test('snapshots carry browser favicons while keeping private icons out of regular windows', async () => {
  const { controller, tabs } = fixture();
  tabs[0].favIconUrl = 'https://example.org/icon.png';
  tabs[3].favIconUrl = 'https://private.example/icon.png';
  await controller.initialize();
  const snapshot = await controller.snapshot(1);
  assert.equal(snapshot.tabs.find(tab => tab.id === 1)?.favIconUrl, tabs[0].favIconUrl);
  assert(!snapshot.tabs.some(tab => tab.favIconUrl === tabs[3].favIconUrl));
});

function fixture(closeTimeout = 3000) {
  let nextId = 10;
  const url = 'moz-extension://test/picker.html';
  const tabs: browser.tabs.Tab[] = [
    { id: 1, windowId: 1, title: 'Origin', url: 'https://example.org', active: true, pinned: false, incognito: false, lastAccessed: 100 },
    { id: 2, windowId: 1, title: 'Previous', url: 'https://mozilla.org', active: false, pinned: false, incognito: false, lastAccessed: 90 },
    { id: 3, windowId: 2, title: 'Other window', url: 'about:config', active: true, pinned: false, incognito: false, lastAccessed: 80 },
    { id: 4, windowId: 3, title: 'Private', url: 'https://private.example', active: true, pinned: false, incognito: true, lastAccessed: 70 },
  ];
  let focusedWindow = 1;
  const stored: Record<string, unknown> = {};
  const get = async (id: number) => {
    const tab = tabs.find(tab => tab.id === id);
    if (!tab) throw new Error('Tab not found');
    return tab;
  };
  const api = {
    runtime: { getURL: () => url },
    tabs: {
      query: async (query: { windowId?: number; active?: boolean }) => tabs.filter(tab =>
        (query.windowId === undefined || tab.windowId === query.windowId) && (query.active === undefined || tab.active === query.active)),
      get,
      create: async (options: { windowId?: number; active?: boolean; url?: string; openerTabId?: number }) => {
        const windowId = options.windowId ?? focusedWindow;
        if (options.active) tabs.filter(tab => tab.windowId === windowId).forEach(tab => { tab.active = false; });
        const tab = { id: nextId++, windowId, active: options.active ?? false, url: options.url, incognito: windowId === 3, pinned: false, openerTabId: options.openerTabId };
        tabs.push(tab); return tab;
      },
      update: async (id: number, options: Partial<browser.tabs.Tab>) => {
        const tab = await get(id);
        if (options.active) tabs.filter(other => other.windowId === tab.windowId).forEach(other => { other.active = false; });
        Object.assign(tab, options); return tab;
      },
      remove: async (id: number) => {
        const index = tabs.findIndex(tab => tab.id === id);
        if (index < 0) throw new Error('Missing');
        const [removed] = tabs.splice(index, 1);
        if (removed.active) {
          // Model native close behavior; the extension must not activate a
          // previously stored tab ID to achieve this.
          const available = tabs.filter(tab => tab.windowId === removed.windowId && !tab.hidden && !tab.discarded);
          const next = available.find(tab => tab.id === removed.openerTabId) ?? available.at(-1);
          if (next) next.active = true;
        }
      },
    },
    windows: {
      get: async (id: number) => ({ id, incognito: id === 3 }),
      getLastFocused: async () => ({ id: focusedWindow, incognito: focusedWindow === 3 }),
      update: async (id: number) => { focusedWindow = id; return { id, incognito: id === 3 }; },
    },
    storage: { session: {
      get: async () => structuredClone(stored),
      set: async (value: Record<string, unknown>) => { Object.assign(stored, structuredClone(value)); },
    } },
  } as unknown as Pick<typeof browser, 'runtime' | 'tabs' | 'windows' | 'storage'>;
  const controller = new TabController(api, closeTimeout);
  return { controller, tabs, api, getFocused: () => focusedWindow, getPicker: () => tabs.find(tab => tab.url === url)! };
}

test('history creation assigns a destination only when it creates a new tab', async () => {
  const f = fixture(); const assigned: number[] = [];
  const controller = new TabController(f.api, 3000, async tab => { assigned.push(tab.id!); });
  await controller.initialize(); await controller.toggle(1);
  await controller.openHistory('https://new.example/session', f.getPicker());
  assert.equal(assigned.length, 1);
  await controller.openHistory('https://new.example/session#section', f.getPicker());
  assert.equal(assigned.length, 1);
  assert.equal(f.tabs.find(tab => tab.id === assigned[0])?.active, true);
});

test('acceptance callback runs only after a successful selection, including existing history targets', async () => {
  const f = fixture(); const accepted: { id: number; caller: number }[] = [];
  const controller = new TabController(f.api, 3000, undefined, async (tab, caller) => {
    assert.equal(tab.active, true);
    accepted.push({ id: tab.id!, caller });
  });
  await controller.initialize(); await controller.toggle(1);
  await controller.request({ type: 'select', id: 2 }, f.getPicker());
  await controller.openHistory('https://example.org/#section', f.getPicker());
  assert.deepEqual(accepted, [{ id: 2, caller: 1 }, { id: 1, caller: 1 }]);
  await assert.rejects(controller.request({ type: 'select', id: 4 }, f.getPicker()));
  f.api.tabs.update = async () => { throw new Error('Cannot activate'); };
  await assert.rejects(controller.request({ type: 'select', id: 2 }, f.getPicker()), /Cannot activate/);
  assert.equal(accepted.length, 2, 'Failed selection must not change session membership');
});

test('opening an explicit history result creates a tab or selects an already open matching page', async () => {
  const { controller, tabs, getPicker } = fixture();
  await controller.initialize(); await controller.toggle(1);
  await controller.openHistory('https://new.example/page', getPicker());
  assert.equal(tabs.find(tab => tab.active && tab.windowId === 1)?.url, 'https://new.example/page');
  const count = tabs.length;
  await controller.openHistory('https://example.org/#section', getPicker());
  assert.equal(tabs.length, count);
  assert.equal(tabs.find(tab => tab.id === 1)?.active, true);
  await assert.rejects(controller.openHistory('javascript:alert(1)', getPicker()), /unavailable/);
  await assert.rejects(controller.openHistory('https://new.example', { ...getPicker(), incognito: true }), /unavailable/);
});

test('opening creates a picker owned by the origin; second toggle closes it natively', async () => {
  const { controller, tabs, getPicker } = fixture();
  await controller.initialize(); await controller.toggle(1);
  assert.equal(getPicker().active, true);
  assert.equal(getPicker().openerTabId, 1);
  assert.equal((await controller.snapshot(1)).tabs.find(tab => tab.origin)?.id, 1);
  await controller.toggle(1);
  assert.equal(tabs.find(tab => tab.id === 1)?.active, true);
  assert.equal(tabs.some(tab => controller.isPicker(tab)), false);
  await controller.toggle(1);
  assert.equal(tabs.filter(tab => controller.isPicker(tab)).length, 1);
});
test('snapshot hides picker pages and separates private and regular windows', async () => {
  const { controller } = fixture();
  await controller.initialize(); await controller.toggle(1); await controller.toggle(3);
  assert.deepEqual((await controller.snapshot(1)).tabs.map(tab => tab.id), [1, 2, 3]);
  assert.deepEqual((await controller.snapshot(3)).tabs.map(tab => tab.id), [4]);
});
test('selecting a tab activates it and focuses its owning window', async () => {
  const { controller, getPicker, getFocused, tabs } = fixture();
  await controller.initialize(); await controller.toggle(1);
  await controller.request({ type: 'select', id: 3 }, getPicker());
  assert.equal(getFocused(), 2);
  assert.equal(tabs.find(tab => tab.id === 3)?.active, true);
});
test('private tabs cannot be selected or closed from a regular picker', async () => {
  const { controller, getPicker, tabs } = fixture();
  await controller.initialize(); await controller.toggle(1);
  await assert.rejects(controller.request({ type: 'select', id: 4 }, getPicker()));
  await assert.rejects(controller.request({ type: 'close', ids: [2, 4] }, getPicker()));
  assert.ok(tabs.some(tab => tab.id === 2));
});
test('picker activation does not pollute tab recency', async () => {
  const { controller, getPicker } = fixture();
  await controller.initialize(); await controller.toggle(1);
  await controller.activated(getPicker().id!);
  assert.equal((await controller.snapshot(1)).tabs.find(tab => tab.id === 1)?.lastUsed, 100);
  await controller.activated(2);
  assert.ok((await controller.snapshot(1)).tabs.find(tab => tab.id === 2)!.lastUsed > 100);
});
test('cancel lets the browser select a remaining tab if the origin was removed', async () => {
  const { controller, api, getPicker, tabs } = fixture();
  await controller.initialize(); await controller.toggle(1);
  await api.tabs.remove(1); await controller.removed(1);
  await controller.request({ type: 'return' }, getPicker());
  assert.equal(tabs.find(tab => tab.id === 2)?.active, true);
});
test('cancel creates a new tab when no ordinary tab remains in this window', async () => {
  const { controller, api, getPicker, tabs } = fixture();
  await controller.initialize(); await controller.toggle(1);
  await api.tabs.remove(1); await api.tabs.remove(2);
  await controller.removed(1); await controller.removed(2);
  await controller.request({ type: 'return' }, getPicker());
  assert.ok(tabs.some(tab => tab.windowId === 1 && tab.active && !controller.isPicker(tab)));
});
test('sessions and recency survive background recreation', async () => {
  const { controller, api } = fixture();
  await controller.initialize(); await controller.toggle(1); await controller.activated(2);
  const restored = new TabController(api);
  await restored.initialize();
  assert.equal((await restored.snapshot(1)).tabs.find(tab => tab.origin)?.id, 1);
  assert.ok((await restored.snapshot(1)).tabs.find(tab => tab.id === 2)!.lastUsed > 100);
});
test('close deduplicates ids and never removes the picker itself', async () => {
  const { controller, getPicker, tabs } = fixture();
  await controller.initialize(); await controller.toggle(1);
  await assert.rejects(controller.request({ type: 'close', ids: [getPicker().id!] }, getPicker()));
  await controller.request({ type: 'close', ids: [2, 2, 3] }, getPicker());
  assert.deepEqual(tabs.filter(tab => !controller.isPicker(tab)).map(tab => tab.id), [1, 4]);
});
test('pin toggles the selected tab without switching focus', async () => {
  const { controller, getPicker, tabs } = fixture();
  await controller.initialize(); await controller.toggle(1);
  await controller.request({ type: 'pin', id: 2 }, getPicker());
  assert.equal(tabs.find(tab => tab.id === 2)?.pinned, true);
  assert.equal(getPicker().active, true);
});

test('hotkey never returns to an origin whose close animation has not finished', async () => {
  const { controller, api, getPicker, tabs } = fixture();
  await controller.initialize(); await controller.toggle(1);
  // Zen may resolve remove while the native tab still exists, before onRemoved.
  const remove = api.tabs.remove;
  api.tabs.remove = async id => {
    if (id === 1) { tabs.find(tab => tab.id === id)!.hidden = true; controller.observeRemoval(id); }
    else await remove(id);
  };
  await controller.request({ type: 'close', ids: [1] }, getPicker());
  assert.ok(tabs.some(tab => tab.id === 1));
  assert.ok(!(await controller.snapshot(1)).tabs.some(tab => tab.id === 1));
  await controller.toggle(1);
  assert.equal(tabs.find(tab => tab.id === 1)?.active, false);
  assert.equal(tabs.find(tab => tab.id === 2)?.active, true);
  await controller.toggle(1); await controller.toggle(1);
  assert.equal(tabs.find(tab => tab.id === 1)?.active, false);
  assert.equal(tabs.filter(tab => controller.isPicker(tab)).length, 0);
});
test('pending close exclusions survive background recreation', async () => {
  const { controller, api, getPicker, tabs } = fixture();
  await controller.initialize(); await controller.toggle(1);
  const remove = api.tabs.remove;
  api.tabs.remove = async id => {
    if (id === 1) { tabs.find(tab => tab.id === id)!.hidden = true; controller.observeRemoval(id); }
    else await remove(id);
  };
  await controller.request({ type: 'close', ids: [1] }, getPicker());
  const restored = new TabController(api);
  await restored.initialize();
  assert.ok(!(await restored.snapshot(1)).tabs.some(tab => tab.id === 1));
  await restored.toggle(1);
  assert.equal((await api.tabs.get(2)).active, true);
});
test('return does not unhide a Zen tab from another workspace', async () => {
  const { controller, getPicker, tabs } = fixture();
  await controller.initialize(); await controller.toggle(1);
  tabs.find(tab => tab.id === 1)!.hidden = true;
  await controller.request({ type: 'return' }, getPicker());
  assert.equal(tabs.find(tab => tab.id === 1)?.active, false);
  assert.equal(tabs.find(tab => tab.id === 2)?.active, true);
  // Hidden tabs remain available for an explicit cross-workspace search.
  assert.ok((await controller.snapshot(1)).tabs.some(tab => tab.id === 1));
});
test('cancel never looks up or activates historical tab IDs', async () => {
  const { controller, api, tabs } = fixture();
  await controller.initialize(); await controller.toggle(1);
  const get = api.tabs.get;
  await api.tabs.remove(1);
  api.tabs.get = async id => {
    assert.ok(tabs.find(tab => tab.id === id && controller.isPicker(tab)), 'only the picker may be looked up');
    return get(id);
  };
  api.tabs.update = async () => { throw new Error('Cancellation must not activate a saved tab ID'); };
  await controller.toggle(1);
  assert.equal(tabs.find(tab => tab.id === 2)?.active, true);
});
test('hotkey return does not wake a pinned tab closed by unloading in Zen', async () => {
  const { controller, tabs, getPicker } = fixture();
  await controller.initialize(); await controller.toggle(1);
  Object.assign(tabs.find(tab => tab.id === 1)!, { pinned: true, discarded: true });
  await controller.toggle(1);
  assert.equal(tabs.find(tab => tab.id === 1)?.active, false);
  assert.equal(tabs.find(tab => tab.id === 2)?.active, true);
  // Explicit search selection can still activate an unloaded tab.
  await controller.toggle(1);
  await controller.request({ type: 'select', id: 1 }, getPicker());
  assert.equal(tabs.find(tab => tab.id === 1)?.active, true);
});
test('failed removals stay visible and report an error instead of claiming success', async () => {
  const { controller, api, getPicker } = fixture();
  await controller.initialize(); await controller.toggle(1);
  const remove = api.tabs.remove;
  api.tabs.remove = async () => { throw new Error('Cannot close tab'); };
  await assert.rejects(controller.request({ type: 'close', ids: [1] }, getPicker()), /Could not close/);
  assert.ok((await controller.snapshot(1)).tabs.some(tab => tab.id === 1));
  api.tabs.remove = remove;
  await controller.toggle(1);
  assert.equal((await api.tabs.get(1)).active, true);
});
test('Zen placeholder IDs are excluded from results and opening the picker', async () => {
  const { controller, tabs } = fixture();
  tabs.forEach(tab => { tab.active = false; });
  tabs.push({ id: -1, windowId: 1, title: 'Empty Zen tab', active: true, pinned: false, incognito: false });
  await controller.initialize(); await controller.toggle(1);
  assert.ok(!(await controller.snapshot(1)).tabs.some(tab => tab.id === -1));
  assert.equal(tabs.filter(tab => controller.isPicker(tab)).length, 0);
});

test('cancel only removes the picker and never activates or recreates a normal tab', async () => {
  const { controller, api, getPicker } = fixture();
  await controller.initialize(); await controller.toggle(1);
  const id = getPicker().id!;
  const removed: number[] = [];
  const remove = api.tabs.remove;
  api.tabs.remove = async id => { removed.push(id); await remove(id); };
  api.tabs.update = async () => { throw new Error('Unexpected tab activation on cancel'); };
  api.tabs.create = async () => { throw new Error('Unexpected tab creation on cancel'); };
  await controller.toggle(1);
  assert.deepEqual(removed, [id]);
});

test('return action and hotkey use the same native picker close path', async () => {
  const { controller, api, getPicker, tabs } = fixture();
  await controller.initialize(); await controller.toggle(1);
  const picker = getPicker();
  api.tabs.update = async () => { throw new Error('Unexpected historical tab activation'); };
  await controller.request({ type: 'return' }, picker);
  assert.ok(!tabs.some(tab => tab.id === picker.id));
  // A repeated return request from a disappearing page must be idempotent.
  await controller.request({ type: 'return' }, picker);
  assert.equal(tabs.filter(tab => tab.windowId === 1).length, 2);
});

test('reused picker updates its opener to the latest invocation source', async () => {
  const { controller, api, getPicker, tabs } = fixture();
  await controller.initialize(); await controller.toggle(1);
  const pickerId = getPicker().id;
  await api.tabs.update(2, { active: true });
  await controller.toggle(1);
  assert.equal(getPicker().id, pickerId);
  assert.equal(getPicker().openerTabId, 2);
  await controller.toggle(1);
  assert.equal(tabs.find(tab => tab.id === 2)?.active, true);
});

test('a failed picker close can be retried without losing the session', async () => {
  const { controller, api, getPicker } = fixture();
  await controller.initialize(); await controller.toggle(1);
  const pickerId = getPicker().id!;
  const remove = api.tabs.remove;
  api.tabs.remove = async () => { throw new Error('Temporary close failure'); };
  await assert.rejects(controller.toggle(1), /Temporary close failure/);
  assert.equal(getPicker().id, pickerId);
  assert.equal((await controller.snapshot(1)).tabs.find(tab => tab.origin)?.id, 1);
  api.tabs.remove = remove;
  await controller.toggle(1);
  assert.equal(getPicker(), undefined);
});

test('closing a picker never removes another window or a non-picker tab', async () => {
  const { controller, tabs, getPicker } = fixture();
  await controller.initialize(); await controller.toggle(1);
  await controller.closePicker(2, getPicker().id!);
  await controller.closePicker(1, 1);
  assert.equal(tabs.length, 5);
});

test('command source wins over stale active-tab query results', async () => {
  const { controller, api, getPicker, tabs } = fixture();
  await controller.initialize(); await controller.toggle(1);
  const source = { ...getPicker() };
  const query = api.tabs.query;
  api.tabs.query = async options => options.active ? [{ ...tabs[0], active: true }] : query(options);
  api.windows.getLastFocused = async () => { throw new Error('Command must use its source window'); };
  await controller.toggle(undefined, source);
  assert.equal(tabs.filter(tab => controller.isPicker(tab)).length, 0);
  assert.equal(tabs.length, 4);
});

test('a loading picker is recognized by its recorded ID before its URL is available', async () => {
  const { controller, getPicker, tabs } = fixture();
  await controller.initialize(); await controller.toggle(1);
  const picker = getPicker();
  picker.url = undefined;
  assert.equal(controller.isPicker(picker), true);
  assert.ok(!(await controller.snapshot(1)).tabs.some(tab => tab.id === picker.id));
  await controller.toggle(1, { ...picker });
  assert.equal(tabs.length, 4);
});

test('pending URL identifies a picker even before it has registered with the background', async () => {
  const { controller, tabs } = fixture();
  await controller.initialize();
  tabs.forEach(tab => { if (tab.windowId === 1) tab.active = false; });
  const picker = { id: 50, windowId: 1, active: true, pinned: false, incognito: false,
    url: 'about:blank', pendingUrl: 'moz-extension://test/picker.html' };
  tabs.push(picker);
  await controller.toggle(1, picker);
  assert.equal(tabs.length, 4);
});

test('two queued commands from one picker cannot close it then create a replacement', async () => {
  const { controller, getPicker, tabs } = fixture();
  await controller.initialize(); await controller.toggle(1);
  const source = { ...getPicker() };
  await controller.toggle(1, source);
  await controller.toggle(1, source);
  assert.equal(tabs.length, 4);
  assert.equal(tabs.filter(tab => controller.isPicker(tab)).length, 0);
});

test('a removed picker returned by a stale query is never reused', async () => {
  const { controller, api, getPicker, tabs } = fixture();
  await controller.initialize(); await controller.toggle(1);
  const retired = { ...getPicker(), active: false };
  await controller.toggle(1, getPicker());
  await controller.removed(retired.id!);
  const query = api.tabs.query;
  api.tabs.query = async options => [...await query(options), ...(options.active ? [] : [retired])];
  const update = api.tabs.update;
  api.tabs.update = async (id, changes) => {
    assert.notEqual(id, retired.id, 'must not reactivate the retired picker');
    return update(id, changes);
  };
  await controller.toggle(1, { ...tabs.find(tab => tab.id === 1)! });
  assert.equal(tabs.filter(tab => controller.isPicker(tab)).length, 1);
  assert.notEqual(getPicker().id, retired.id);
});

test('duplicate service tabs are removed when cancelling from the active picker', async () => {
  const { controller, tabs, getPicker } = fixture();
  await controller.initialize(); await controller.toggle(1);
  const active = { ...getPicker() };
  tabs.push({ ...active, id: 88, active: false }, { ...active, id: 89, active: false });
  await controller.toggle(1, active);
  assert.equal(tabs.filter(tab => controller.isPicker(tab)).length, 0);
  assert.equal(tabs.length, 4);
});

test('opening from a normal tab reuses one picker and removes extra service tabs', async () => {
  const { controller, api, tabs, getPicker } = fixture();
  await controller.initialize(); await controller.toggle(1);
  const original = { ...getPicker() };
  tabs.push({ ...original, id: 88, active: false });
  await api.tabs.update(2, { active: true });
  await controller.toggle(1, { ...tabs.find(tab => tab.id === 2)! });
  assert.equal(tabs.filter(tab => controller.isPicker(tab)).length, 1);
  assert.equal(getPicker().id, original.id);
  assert.equal((await controller.snapshot(1)).tabs.find(tab => tab.origin)?.id, 2);
});

test('navigating away unregisters a picker ID, including after background restart', async () => {
  const { controller, api, getPicker, tabs } = fixture();
  await controller.initialize(); await controller.toggle(1);
  const picker = getPicker();
  picker.url = 'https://example.com/now-a-normal-tab';
  await controller.navigated(picker.id!, picker.url);
  assert.equal(controller.isPicker(picker), false);
  const restored = new TabController(api);
  await restored.initialize();
  assert.ok((await restored.snapshot(1)).tabs.some(tab => tab.id === picker.id));
  assert.equal(tabs.length, 5);
});

test('picker ID recognition survives background restart during initial page load', async () => {
  const { controller, api, getPicker } = fixture();
  await controller.initialize(); await controller.toggle(1);
  const picker = getPicker();
  picker.url = 'about:blank';
  const restored = new TabController(api);
  await restored.initialize();
  assert.equal(restored.isPicker(picker), true);
  await restored.toggle(1, { ...picker });
  assert.equal(getPicker(), undefined);
});

test('selecting within the picker window never refocuses the native window', async () => {
  const { controller, api, getPicker, tabs } = fixture();
  await controller.initialize(); await controller.toggle(1);
  api.windows.update = async () => { throw new Error('Window focus must not run for a same-window selection'); };
  await controller.request({ type: 'close', ids: [1] }, getPicker());
  await controller.request({ type: 'select', id: 2 }, getPicker());
  assert.equal(tabs.find(tab => tab.id === 2)?.active, true);
  assert.ok(!tabs.some(tab => tab.id === 1));
});

test('deletion is not acknowledged until the browser completes removal', async () => {
  const { controller, api, getPicker } = fixture();
  await controller.initialize(); await controller.toggle(1);
  const remove = api.tabs.remove;
  api.tabs.remove = async () => {};
  let complete = false;
  const deletion = controller.request({ type: 'close', ids: [1] }, getPicker()).then(result => { complete = true; return result; });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(complete, false);
  assert.equal(controller.isClosing(1), true);
  assert.equal((await controller.snapshot(1)).tabs.some(tab => tab.origin), false);
  await remove(1);
  controller.observeRemoval(1);
  await deletion;
  assert.equal(complete, true);
});

test('an uncompleted close fails visibly and restores the tab and origin', async () => {
  const { controller, api, getPicker } = fixture(15);
  await controller.initialize(); await controller.toggle(1);
  api.tabs.remove = async () => {};
  await assert.rejects(controller.request({ type: 'close', ids: [1] }, getPicker()), /Could not close/);
  assert.equal(controller.isClosing(1), false);
  assert.equal((await controller.snapshot(1)).tabs.find(tab => tab.origin)?.id, 1);
});

test('closed IDs remain blocked if the background restarted while they were absent', async () => {
  const { controller, api, getPicker, tabs } = fixture();
  const old = { ...tabs[0] };
  await controller.initialize(); await controller.toggle(1);
  await controller.request({ type: 'close', ids: [1] }, getPicker());
  const restarted = new TabController(api);
  await restarted.initialize();
  // A stale native reference returning later must not become selectable.
  tabs.push(old);
  assert.ok(!(await restarted.snapshot(1)).tabs.some(tab => tab.id === old.id));
  await assert.rejects(restarted.request({ type: 'select', id: old.id! }, getPicker()), /no longer available/);
});

test('intentional browser undo using a new ID is allowed for the same URL', async () => {
  const { controller, getPicker, tabs } = fixture();
  const old = { ...tabs[0] };
  await controller.initialize(); await controller.toggle(1);
  await controller.request({ type: 'close', ids: [1] }, getPicker());
  tabs.push({ ...old, id: 99, active: false });
  await controller.request({ type: 'select', id: 99 }, getPicker());
  assert.equal(tabs.find(tab => tab.id === 99)?.active, true);
});

test('selection revalidates tab identity if it changed after the snapshot', async () => {
  const { controller, api, getPicker } = fixture();
  await controller.initialize(); await controller.toggle(1);
  const get = api.tabs.get;
  api.tabs.get = async id => ({ ...await get(id), ...(id === 2 ? { url: 'https://changed.example/' } : {}) });
  await assert.rejects(controller.request({ type: 'select', id: 2 }, getPicker()), /tab changed/);
});
