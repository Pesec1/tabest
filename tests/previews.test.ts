import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TabPreviews } from '../src/previews.ts';

const jpeg = 'data:image/jpeg;base64,/9j/test';
function fixture() {
  let now = 1000;
  let allowed = true;
  let captures = 0;
  const tabs = new Map<number, browser.tabs.Tab>([
    [1, { id: 1, windowId: 1, active: false, pinned: false, incognito: false, url: 'https://example.org/' }],
    [2, { id: 2, windowId: 2, active: false, pinned: false, incognito: true, url: 'https://private.example/' }],
    [3, { id: 3, windowId: 1, active: false, pinned: false, incognito: false, url: 'about:config' }],
    [4, { id: 4, windowId: 1, active: false, pinned: false, incognito: false, url: 'https://sleep.example/', discarded: true }],
  ]);
  const api = {
    tabs: {
      get: async (id: number) => {
        const tab = tabs.get(id);
        if (!tab) throw new Error('Missing');
        return { ...tab };
      },
      captureTab: async () => { captures++; return jpeg; },
    },
    windows: { get: async (id: number) => ({ id, incognito: id === 2 }) },
    permissions: { contains: async () => allowed },
  } as unknown as Pick<typeof browser, 'tabs' | 'windows' | 'permissions'>;
  const previews = new TabPreviews(api, tab => tab.url?.startsWith('moz-extension:') ?? false, () => now);
  return { previews, api, tabs, captures: () => captures, advance: (ms: number) => { now += ms; }, allow: (value: boolean) => { allowed = value; } };
}

test('captures an inactive tab without creating, focusing or waking tabs', async () => {
  const { previews, captures, tabs } = fixture();
  assert.deepEqual(await previews.get(1, 1), { state: 'ready', dataUrl: jpeg, capturedAt: 1000 });
  assert.equal(captures(), 1);
  assert.equal(tabs.get(1)?.active, false);
});
test('uses cache until its TTL expires', async () => {
  const { previews, captures, advance } = fixture();
  await previews.get(1, 1); advance(14000); await previews.get(1, 1);
  assert.equal(captures(), 1);
  advance(1001); await previews.get(1, 1);
  assert.equal(captures(), 2);
});
test('simultaneous requests share one capture', async () => {
  const { previews, captures } = fixture();
  const replies = await Promise.all([previews.get(1, 1), previews.get(1, 1), previews.get(1, 1)]);
  assert.equal(captures(), 1);
  assert.ok(replies.every(reply => reply.state === 'ready'));
});
test('private and normal windows cannot request each other\'s images, even cached', async () => {
  const { previews, captures } = fixture();
  assert.equal((await previews.get(2, 2)).state, 'ready');
  assert.deepEqual(await previews.get(2, 1), { state: 'unavailable', reason: 'missing' });
  assert.deepEqual(await previews.get(1, 2), { state: 'unavailable', reason: 'missing' });
  assert.equal(captures(), 1);
});
test('protected, sleeping, extension and missing tabs have explicit fallbacks', async () => {
  const { previews, captures, tabs } = fixture();
  assert.deepEqual(await previews.get(3, 1), { state: 'unavailable', reason: 'protected' });
  assert.deepEqual(await previews.get(4, 1), { state: 'unavailable', reason: 'sleeping' });
  assert.deepEqual(await previews.get(999, 1), { state: 'unavailable', reason: 'missing' });
  tabs.get(1)!.url = 'moz-extension://test/picker.html';
  assert.deepEqual(await previews.get(1, 1), { state: 'unavailable', reason: 'protected' });
  assert.equal(captures(), 0);
});
test('permission denial never calls capture and cannot expose a cached image', async () => {
  const { previews, allow, captures } = fixture();
  await previews.get(1, 1); allow(false);
  assert.deepEqual(await previews.get(1, 1), { state: 'unavailable', reason: 'permission' });
  assert.equal(captures(), 1);
});
test('navigation invalidates the image for the old page', async () => {
  const { previews, tabs, captures } = fixture();
  await previews.get(1, 1);
  tabs.get(1)!.url = 'https://example.org/new';
  await previews.get(1, 1);
  assert.equal(captures(), 2);
  previews.invalidate(1); await previews.get(1, 1);
  assert.equal(captures(), 3);
});
test('a capture finishing after invalidation cannot return its stale image', async () => {
  const { previews, api } = fixture();
  api.tabs.captureTab = async () => { previews.invalidate(1); return jpeg; };
  assert.deepEqual(await previews.get(1, 1), { state: 'unavailable', reason: 'changed' });
});
test('permission revocation during a capture discards the result', async () => {
  const { previews, api, allow } = fixture();
  api.tabs.captureTab = async () => { allow(false); return jpeg; };
  assert.deepEqual(await previews.get(1, 1), { state: 'unavailable', reason: 'permission' });
});
test('a tab changing URL during capture cannot return the previous document', async () => {
  const { previews, api, tabs } = fixture();
  api.tabs.captureTab = async () => { tabs.get(1)!.url = 'https://example.org/new'; return jpeg; };
  assert.deepEqual(await previews.get(1, 1), { state: 'unavailable', reason: 'changed' });
});
test('failed captures are briefly cached, then retried', async () => {
  const { previews, api, advance } = fixture();
  let attempts = 0;
  api.tabs.captureTab = async () => { attempts++; throw new Error('Protected browser page'); };
  assert.deepEqual(await previews.get(1, 1), { state: 'unavailable', reason: 'failed' });
  await previews.get(1, 1); assert.equal(attempts, 1);
  advance(3001); await previews.get(1, 1); assert.equal(attempts, 2);
});
test('malformed capture results are not used as image sources', async () => {
  const { previews, api } = fixture();
  api.tabs.captureTab = async () => 'https://unexpected.example/track';
  assert.deepEqual(await previews.get(1, 1), { state: 'unavailable', reason: 'failed' });
});
test('cache evicts old previews when the memory budget is exceeded', async () => {
  const { previews, api, tabs } = fixture();
  tabs.set(5, { ...tabs.get(1)!, id: 5, url: 'https://another.example/' });
  let captures = 0;
  api.tabs.captureTab = async () => { captures++; return jpeg + 'a'.repeat(2_100_000); };
  await previews.get(1, 1); await previews.get(5, 1); await previews.get(1, 1);
  assert.equal(captures, 3);
});
test('captures are serialized independently of the tab controller', async () => {
  const { previews, api, tabs } = fixture();
  tabs.set(5, { ...tabs.get(1)!, id: 5, url: 'https://another.example/' });
  let inFlight = 0;
  let max = 0;
  api.tabs.captureTab = async () => {
    inFlight++; max = Math.max(max, inFlight);
    await new Promise(resolve => setTimeout(resolve, 5));
    inFlight--; return jpeg;
  };
  const results = await Promise.all([previews.get(1, 1), previews.get(5, 1)]);
  assert.ok(results.every(result => result.state === 'ready'));
  assert.equal(max, 1);
});

test('a closing target cannot return even a previously cached screenshot', async () => {
  const { api, captures } = fixture();
  let closing = false;
  const previews = new TabPreviews(api, () => closing);
  await previews.get(1, 1);
  closing = true;
  assert.deepEqual(await previews.get(1, 1), { state: 'unavailable', reason: 'protected' });
  assert.equal(captures(), 1);
});

test('a queued screenshot is cancelled if its tab starts closing before capture', async () => {
  const { api, tabs, captures } = fixture();
  tabs.set(5, { ...tabs.get(1)!, id: 5, url: 'https://another.example/' });
  const closing = new Set<number>();
  const previews = new TabPreviews(api, tab => closing.has(tab.id!));
  const capture = api.tabs.captureTab;
  api.tabs.captureTab = async (id, options) => {
    if (id === 1) { closing.add(5); await new Promise(resolve => setTimeout(resolve, 5)); }
    return capture(id, options);
  };
  const results = await Promise.all([previews.get(1, 1), previews.get(5, 1)]);
  assert.equal(results[0].state, 'ready');
  assert.deepEqual(results[1], { state: 'unavailable', reason: 'changed' });
  assert.equal(captures(), 1);
});
