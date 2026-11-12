import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkSessions, UNASSIGNED, ALL_SESSIONS } from '../src/work-sessions.ts';
import type { Request, Snapshot } from '../src/model.ts';

function fixture() {
  const tabs = new Map<number, browser.tabs.Tab>();
  const local: Record<string, unknown> = {};
  const memory: Record<string, unknown> = {};
  const tabValues = new Map<number, unknown>();
  const windowValues = new Map<number, unknown>();
  const writes: number[] = [];
  let nextId = 1;
  const add = (windowId = 1, incognito = false, extra: Partial<browser.tabs.Tab> = {}) => {
    const tab = { id: nextId++, windowId, active: false, pinned: false, incognito, url: 'https://example.test/', ...extra };
    tabs.set(tab.id, tab); return tab;
  };
  const caller = add(1, false, { url: 'picker' });
  const privateCaller = add(2, true, { url: 'picker' });
  const first = add(); const second = add();
  const api = {
    tabs: {
      query: async () => [...tabs.values()],
      get: async (id: number) => { const tab = tabs.get(id); if (!tab) throw new Error('Missing tab'); return { ...tab }; },
      create: async (options: Partial<browser.tabs.Tab>) => add(options.windowId, options.windowId === 2, options),
      update: async (id: number, changes: object) => { Object.assign(tabs.get(id)!, changes); return tabs.get(id)!; },
    },
    windows: { get: async (id: number) => ({ id, incognito: id === 2 }) },
    sessions: {
      getTabValue: async (id: number) => tabValues.get(id),
      setTabValue: async (id: number, _key: string, value: unknown) => { assert.equal(tabs.get(id)?.incognito, false); writes.push(id); tabValues.set(id, value); },
      getWindowValue: async (id: number) => { assert.notEqual(id, 2); return windowValues.get(id); },
      setWindowValue: async (id: number, _key: string, value: unknown) => { assert.notEqual(id, 2); windowValues.set(id, value); },
    },
    storage: {
      local: { get: async () => structuredClone(local), set: async (value: object) => { Object.assign(local, structuredClone(value)); } },
      session: { get: async () => structuredClone(memory), set: async (value: object) => { Object.assign(memory, structuredClone(value)); } },
    },
  } as unknown as ConstructorParameters<typeof WorkSessions>[0];
  const manager = () => new WorkSessions(api, tab => tab.url === 'picker' || tab.id! < 0);
  let sessions = manager();
  const snapshot = async (callerTab = caller) => sessions.decorate({ windowId: callerTab.windowId, private: callerTab.incognito,
    tabs: [...tabs.values()].filter(tab => tab.url !== 'picker' && tab.incognito === callerTab.incognito).map(tab => ({ ...tab, id: tab.id!, title: 'Fixture', url: tab.url!, lastUsed: 0, audible: false, muted: false, discarded: false, origin: false })),
  } as Snapshot);
  const request = (request: Request, tab = caller) => sessions.request(request, tab);
  const create = async (name: string, ids: number[] = [], tab = caller) => {
    await request({ type: 'session-create', name, ids }, tab);
    return (await snapshot(tab)).workSessions!.activeSessionId;
  };
  return { tabs, local, memory, tabValues, windowValues, writes, caller, privateCaller, first, second, add,
    snapshot, request, create, init: () => sessions.initialize(), created: (tab: browser.tabs.Tab) => sessions.created(tab),
    restart: async () => { sessions = manager(); await sessions.initialize(); },
    accepted: (id: number, windowId = 1) => sessions.accepted(tabs.get(id)!, windowId),
    removed: (id: number) => sessions.removed(id), windowRemoved: (id: number) => sessions.windowRemoved(id) };
}

test('sessions create empty, move marked tabs, rename and delete without touching native tab state', async () => {
  const f = fixture(); await f.init();
  const before = structuredClone([...f.tabs.values()]);
  const id = await f.create('Work');
  assert.equal((await f.snapshot()).tabs.filter(tab => tab.sessionIds?.includes(id)).length, 0);
  await f.request({ type: 'session-move', sessionId: id, ids: [f.first.id!, f.second.id!, f.first.id!] });
  assert.equal(f.writes.length, 2);
  await f.request({ type: 'session-rename', sessionId: id, name: ' Project ' });
  assert.equal((await f.snapshot()).workSessions!.sessions.at(-1)!.name, 'Project');
  await f.request({ type: 'session-delete', sessionId: id });
  const snapshot = await f.snapshot();
  assert.ok(snapshot.tabs.every(tab => tab.sessionIds?.length === 0));
  assert.equal(snapshot.workSessions!.activeSessionId, ALL_SESSIONS);
  assert.deepEqual([...f.tabs.values()], before);
});

test('new tabs use current session, links inherit source, and picker children use current session', async () => {
  const f = fixture(); await f.init();
  const source = await f.create('Source', [f.first.id!]);
  const current = await f.create('Current');
  const blank = f.add(); await f.created(blank);
  const child = f.add(1, false, { openerTabId: f.first.id }); await f.created(child);
  const launched = f.add(1, false, { openerTabId: f.caller.id }); await f.created(launched);
  const snapshot = await f.snapshot();
  assert.deepEqual(snapshot.tabs.find(tab => tab.id === blank.id)!.sessionIds, [current]);
  assert.deepEqual(snapshot.tabs.find(tab => tab.id === child.id)!.sessionIds, [source]);
  assert.deepEqual(snapshot.tabs.find(tab => tab.id === launched.id)!.sessionIds, [current]);
  assert.deepEqual(snapshot.tabs.find(tab => tab.id === f.second.id)!.sessionIds, []);
});

test('a snapshot before queued onCreated does not prevent automatic assignment', async () => {
  const f = fixture(); await f.init(); const id = await f.create('Work');
  const tab = f.add(); await f.snapshot(); await f.created(tab);
  assert.deepEqual((await f.snapshot()).tabs.find(item => item.id === tab.id)!.sessionIds, [id]);
});

test('membership and empty sessions survive background recreation and restored tab IDs', async () => {
  const f = fixture(); await f.init(); const id = await f.create('Work', [f.first.id!]);
  await f.create('Empty');
  await f.restart();
  assert.deepEqual((await f.snapshot()).tabs.find(tab => tab.id === f.first.id)!.sessionIds, [id]);
  const restored = f.add(); f.tabValues.set(restored.id!, id); await f.created(restored);
  assert.deepEqual((await f.snapshot()).tabs.find(tab => tab.id === restored.id)!.sessionIds, [id]);
  assert.equal((await f.snapshot()).workSessions!.sessions.at(-1)!.name, 'Empty');
});

test('restoring a tab from a deleted session stays unassigned, not the current session', async () => {
  const f = fixture(); await f.init(); const id = await f.create('Old');
  await f.request({ type: 'session-delete', sessionId: id }); await f.create('New');
  const restored = f.add(); f.tabValues.set(restored.id!, id); await f.created(restored);
  assert.deepEqual((await f.snapshot()).tabs.find(tab => tab.id === restored.id)!.sessionIds, []);
});

test('auto-add can be disabled while explicit new-tab creation still uses the chosen session', async () => {
  const f = fixture(); await f.init(); const id = await f.create('Work', [f.first.id!]);
  await f.request({ type: 'session-auto', enabled: false });
  const child = f.add(1, false, { openerTabId: f.first.id }); await f.created(child);
  assert.deepEqual((await f.snapshot()).tabs.find(tab => tab.id === child.id)!.sessionIds, []);
  await f.request({ type: 'session-new-tab' });
  assert.deepEqual(f.tabValues.get([...f.tabs.keys()].at(-1)!), [id]);
  await f.restart(); assert.equal((await f.snapshot()).workSessions!.autoAssign, false);
});

test('private catalogs and memberships only use session storage and clear after the last private window', async () => {
  const f = fixture(); await f.init(); await f.create('Public');
  const privateTab = f.add(2, true);
  const before = structuredClone(f.local);
  const id = await f.create('Private secret', [privateTab.id!], f.privateCaller);
  assert.deepEqual(f.local, before);
  assert.equal(JSON.stringify(f.local).includes('Private secret'), false);
  assert.equal((await f.snapshot()).workSessions!.sessions.some(session => session.id === id), false);
  await f.restart(); assert.deepEqual((await f.snapshot(f.privateCaller)).tabs[0].sessionIds, [id]);
  for (const [id, tab] of f.tabs) if (tab.incognito) f.tabs.delete(id);
  await f.windowRemoved(2);
  assert.equal(JSON.stringify(f.memory).includes('Private secret'), false);
});

test('selection validation prevents private/service/missing tabs and all writes happen after validation', async () => {
  const f = fixture(); await f.init(); const id = await f.create('Work');
  const privateTab = f.add(2, true);
  for (const invalid of [privateTab.id!, f.caller.id!, 999]) {
    await assert.rejects(f.request({ type: 'session-move', sessionId: id, ids: [f.first.id!, invalid] }));
  }
  assert.equal(f.writes.length, 0);
  await assert.rejects(f.create('Invalid', [f.caller.id!]));
  assert.equal((await f.snapshot()).workSessions!.sessions.length, 1);
});

test('names and built-in session operations are validated without changing the catalog', async () => {
  const f = fixture(); await f.init(); await f.create('Work');
  for (const name of ['', 'work', 'All sessions', 'x'.repeat(81), 'line\nfeed']) await assert.rejects(f.create(name));
  await assert.rejects(f.request({ type: 'session-delete', sessionId: ALL_SESSIONS }));
  await assert.rejects(f.request({ type: 'session-switch', sessionId: 'missing' }));
  assert.equal((await f.snapshot()).workSessions!.sessions.length, 1);
});

test('sessions span normal windows without moving tabs and each window has its own destination', async () => {
  const f = fixture(); await f.init(); const id = await f.create('Work');
  const other = f.add(3, false, { url: 'picker' }); const tab = f.add(3);
  await f.request({ type: 'session-move', sessionId: id, ids: [tab.id!] });
  assert.equal(f.tabs.get(tab.id!)!.windowId, 3);
  assert.equal((await f.snapshot(other)).workSessions!.activeSessionId, ALL_SESSIONS);
  await f.request({ type: 'session-switch', sessionId: id }, other);
  assert.equal((await f.snapshot(other)).workSessions!.activeSessionId, id);
});

test('All sessions is the initial selection and only user-created sessions appear in the catalog', async () => {
  const f = fixture(); await f.init();
  const state = (await f.snapshot()).workSessions!;
  assert.equal(state.activeSessionId, ALL_SESSIONS);
  assert.deepEqual(state.sessions, []);
});

test('All sessions survives background restart without losing memberships or assigning new tabs to the old session', async () => {
  const f = fixture(); await f.init(); const work = await f.create('Work', [f.first.id!]);
  await f.request({ type: 'session-switch', sessionId: ALL_SESSIONS });
  await f.restart();
  assert.equal((await f.snapshot()).workSessions!.activeSessionId, ALL_SESSIONS);
  assert.deepEqual((await f.snapshot()).tabs.find(tab => tab.id === f.first.id)!.sessionIds, [work]);
  const newTab = f.add(); await f.created(newTab);
  assert.deepEqual((await f.snapshot()).tabs.find(tab => tab.id === newTab.id)!.sessionIds, []);
  await f.request({ type: 'session-new-tab' });
  assert.deepEqual(f.tabValues.get([...f.tabs.keys()].at(-1)!), []);
});

test('legacy Unsorted selection and membership migrate without touching custom sessions', async () => {
  const f = fixture(); await f.init(); const work = await f.create('Work', [f.first.id!]);
  f.windowValues.set(f.caller.windowId, 'unsorted');
  f.tabValues.set(f.second.id!, 'unsorted');
  await f.restart(); const snapshot = await f.snapshot();
  assert.equal(snapshot.workSessions!.activeSessionId, ALL_SESSIONS);
  assert.deepEqual(snapshot.tabs.find(tab => tab.id === f.second.id)!.sessionIds, []);
  assert.deepEqual(snapshot.tabs.find(tab => tab.id === f.first.id)!.sessionIds, [work]);
  assert.deepEqual(snapshot.workSessions!.sessions.map(session => session.name), ['Work']);
});

test('moving tabs to All sessions removes assignment without changing the selected session', async () => {
  const f = fixture(); await f.init(); const work = await f.create('Work', [f.first.id!]);
  await f.request({ type: 'session-move', sessionId: ALL_SESSIONS, ids: [f.first.id!] });
  const snapshot = await f.snapshot();
  assert.deepEqual(snapshot.tabs.find(tab => tab.id === f.first.id)!.sessionIds, []);
  assert.equal(snapshot.workSessions!.activeSessionId, work);
});

test('private All sessions selection survives background restart and never enters persistent storage', async () => {
  const f = fixture(); await f.init();
  await f.create('Private work', [], f.privateCaller);
  const normal = structuredClone(f.local);
  await f.request({ type: 'session-switch', sessionId: ALL_SESSIONS }, f.privateCaller);
  await f.restart();
  assert.equal((await f.snapshot(f.privateCaller)).workSessions!.activeSessionId, ALL_SESSIONS);
  assert.deepEqual(f.local, normal);
});

test('accepting an existing tab adds current membership without duplicates or native tab changes', async () => {
  const f = fixture(); await f.init();
  const first = await f.create('First', [f.first.id!]);
  const second = await f.create('Second');
  const native = structuredClone([...f.tabs.values()]);
  const writes = f.writes.length;
  await f.accepted(f.first.id!);
  await f.accepted(f.first.id!);
  const snapshot = await f.snapshot();
  assert.deepEqual(snapshot.tabs.find(tab => tab.id === f.first.id)!.sessionIds, [first, second]);
  assert.equal(f.writes.length, writes + 1);
  assert.equal(snapshot.tabs.filter(tab => tab.id === f.first.id).length, 1);
  assert.deepEqual([...f.tabs.values()], native);
  await f.restart();
  assert.deepEqual((await f.snapshot()).tabs.find(tab => tab.id === f.first.id)!.sessionIds, [first, second]);
});

test('All sessions acceptance does not add or replace any memberships', async () => {
  const f = fixture(); await f.init(); const work = await f.create('Work', [f.first.id!]);
  await f.request({ type: 'session-switch', sessionId: ALL_SESSIONS });
  const writes = f.writes.length;
  await f.accepted(f.first.id!); await f.accepted(f.second.id!);
  assert.equal(f.writes.length, writes);
  assert.deepEqual((await f.snapshot()).tabs.find(tab => tab.id === f.first.id)!.sessionIds, [work]);
  assert.deepEqual((await f.snapshot()).tabs.find(tab => tab.id === f.second.id)!.sessionIds, []);
});

test('deleting one session preserves the tab in its other sessions, including after restoration', async () => {
  const f = fixture(); await f.init(); const first = await f.create('First', [f.first.id!]);
  const second = await f.create('Second'); await f.accepted(f.first.id!);
  await f.request({ type: 'session-delete', sessionId: first });
  await f.restart();
  assert.deepEqual((await f.snapshot()).tabs.find(tab => tab.id === f.first.id)!.sessionIds, [second]);
  const restored = f.add(); f.tabValues.set(restored.id!, [first, second]); await f.created(restored);
  assert.deepEqual((await f.snapshot()).tabs.find(tab => tab.id === restored.id)!.sessionIds, [second]);
});

test('children inherit source memberships while ordinary new tabs use only the current session', async () => {
  const f = fixture(); await f.init(); const first = await f.create('First', [f.first.id!]);
  const second = await f.create('Second'); await f.accepted(f.first.id!);
  const child = f.add(1, false, { openerTabId: f.first.id }); await f.created(child);
  const ordinary = f.add(); await f.created(ordinary);
  const snapshot = await f.snapshot();
  assert.deepEqual(snapshot.tabs.find(tab => tab.id === child.id)!.sessionIds, [first, second]);
  assert.deepEqual(snapshot.tabs.find(tab => tab.id === ordinary.id)!.sessionIds, [second]);
});

test('explicit moves replace multiple memberships and moving to All sessions clears them', async () => {
  const f = fixture(); await f.init(); await f.create('First', [f.first.id!]);
  await f.create('Second'); await f.accepted(f.first.id!);
  const third = await f.create('Third');
  await f.request({ type: 'session-move', sessionId: third, ids: [f.first.id!] });
  assert.deepEqual((await f.snapshot()).tabs.find(tab => tab.id === f.first.id)!.sessionIds, [third]);
  await f.request({ type: 'session-move', sessionId: ALL_SESSIONS, ids: [f.first.id!] });
  assert.deepEqual((await f.snapshot()).tabs.find(tab => tab.id === f.first.id)!.sessionIds, []);
});

test('cross-window acceptance uses the calling picker session and retains both window destinations', async () => {
  const f = fixture(); await f.init();
  const callerSession = await f.create('Caller');
  const other = f.add(3, false, { url: 'picker' }); const target = f.add(3);
  const targetSession = await f.create('Target', [target.id!], other);
  await f.accepted(target.id!, 1);
  assert.deepEqual((await f.snapshot()).tabs.find(tab => tab.id === target.id)!.sessionIds, [targetSession, callerSession]);
  assert.equal((await f.snapshot()).workSessions!.activeSessionId, callerSession);
  assert.equal((await f.snapshot(other)).workSessions!.activeSessionId, targetSession);
});

test('array migration ignores malformed, duplicate and nonexistent IDs while preserving legacy strings', async () => {
  const f = fixture(); await f.init(); const first = await f.create('First'); const second = await f.create('Second');
  f.tabValues.set(f.first.id!, [first, first, null, 12, 'unsorted', 'all', '', 'deleted', second]);
  f.tabValues.set(f.second.id!, second);
  await f.restart(); const snapshot = await f.snapshot();
  assert.deepEqual(snapshot.tabs.find(tab => tab.id === f.first.id)!.sessionIds, [first, second]);
  assert.deepEqual(snapshot.tabs.find(tab => tab.id === f.second.id)!.sessionIds, [second]);
});

test('multiple private memberships remain temporary and normal/private acceptance is rejected', async () => {
  const f = fixture(); await f.init(); const privateTab = f.add(2, true);
  const first = await f.create('Private first', [privateTab.id!], f.privateCaller);
  const second = await f.create('Private second', [], f.privateCaller);
  const normal = structuredClone(f.local);
  await f.accepted(privateTab.id!, 2); await f.restart();
  assert.deepEqual((await f.snapshot(f.privateCaller)).tabs[0].sessionIds, [first, second]);
  assert.deepEqual(f.local, normal);
  await assert.rejects(f.accepted(privateTab.id!, 1));
  await assert.rejects(f.accepted(f.first.id!, 2));
  await assert.rejects(f.accepted(f.privateCaller.id!, 2));
});
