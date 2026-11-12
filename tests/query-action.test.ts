import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queryAction } from '../src/query-action.ts';
import { QueryLauncher } from '../src/query-launcher.ts';

test('query action recognizes web addresses, local development URLs, IPv6 and international domains', () => {
  for (const [input, expected] of [
    [' github.com ', 'https://github.com/'], ['example.com/path?q=abc#part', 'https://example.com/path?q=abc#part'],
    ['http://example.com', 'http://example.com/'], ['https://example.com/a b', 'https://example.com/a%20b'],
    ['localhost:3000/test', 'http://localhost:3000/test'], ['127.0.0.1:8080/', 'http://127.0.0.1:8080/'],
    ['[::1]:8080', 'http://[::1]:8080/'], ['пример.рф', 'https://xn--e1afmkfd.xn--p1ai/'],
    ['//example.com', 'https://example.com/'],
  ]) assert.deepEqual(queryAction(input), { kind: 'address', url: expected });
});

test('plain text and ambiguous input are searches, empty input has no action', () => {
  for (const query of ['как настроить nginx', 'telescope', 'site:github.com telescope', 'user@example.com', '1234', '1.2']) {
    assert.deepEqual(queryAction(query), { kind: 'search', query });
  }
  assert.equal(queryAction('   '), undefined);
});

test('unsupported protocols, malformed explicit addresses and credentials never become navigations or web searches', () => {
  for (const query of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/test', 'about:config',
    'ftp://example.com', 'custom://test', 'https:/example.com', 'https://', 'https://example.com:99999',
    'https://user:password@example.com/', 'test\nquery', 'x'.repeat(4097)]) {
    assert.equal(queryAction(query)?.kind, 'invalid', query);
  }
});

function fixture() {
  const tabs: browser.tabs.Tab[] = [];
  const searches: { query: string; tabId: number }[] = [];
  let privateWindow = false;
  const api = {
    tabs: {
      create: async (options: { windowId?: number; url?: string; active?: boolean; openerTabId?: number }) => {
        const tab = { ...options, id: tabs.length + 100, windowId: options.windowId!, active: options.active!, pinned: false, incognito: privateWindow };
        tabs.push(tab); return tab;
      },
      get: async (id: number) => tabs.find(tab => tab.id === id)!,
      update: async (id: number, changes: { active?: boolean }) => Object.assign(tabs.find(tab => tab.id === id)!, changes),
      remove: async (id: number) => { tabs.splice(tabs.findIndex(tab => tab.id === id), 1); },
    },
    windows: { get: async (id: number) => ({ id, incognito: privateWindow }) },
    search: { search: async (options: { query: string; tabId: number }) => {
      searches.push(options); tabs.find(tab => tab.id === options.tabId)!.url = 'https://engine.example/results';
    } },
  } as unknown as Pick<typeof browser, 'tabs' | 'windows' | 'search'>;
  const caller: browser.tabs.Tab = { id: 1, windowId: 7, active: true, pinned: false, incognito: false };
  return { api, caller, tabs, searches, launcher: new QueryLauncher(api), private: () => { privateWindow = true; caller.incognito = true; } };
}

test('address opening and default-engine search target a new tab in the caller window', async () => {
  const f = fixture();
  await f.launcher.launch('example.com/path', f.caller);
  assert.equal(f.tabs[0].url, 'https://example.com/path');
  assert.equal(f.tabs[0].windowId, 7); assert.equal(f.tabs[0].openerTabId, 1); assert(f.tabs[0].active);
  assert.equal(f.searches.length, 0);
  await f.launcher.launch('nginx setup', f.caller);
  assert.deepEqual(f.searches, [{ query: 'nginx setup', tabId: f.tabs[1].id }]);
  assert(f.tabs[1].active); assert.equal(f.tabs[1].windowId, 7);
  assert(!('engine' in f.searches[0]), 'The provider must be chosen by the browser');
});

test('private launches stay private and invalid/empty input creates no tabs', async () => {
  const f = fixture();
  await f.launcher.launch(' ', f.caller);
  await assert.rejects(f.launcher.launch('javascript:alert(1)', f.caller), /HTTP/);
  assert.equal(f.tabs.length, 0);
  f.private(); await f.launcher.launch('private search text', f.caller);
  assert.equal(f.tabs[0].incognito, true); assert.equal(f.searches[0].tabId, f.tabs[0].id);
});

test('explicit destinations are assigned before browser search and retained for address opening', async () => {
  const f = fixture();
  const assigned: number[] = [];
  const launcher = new QueryLauncher(f.api, async tab => { assigned.push(tab.id!); });
  await launcher.launch('example.com', f.caller);
  assert.deepEqual(assigned, [f.tabs[0].id]);
  f.api.search.search = async ({ tabId }) => {
    assert.ok(assigned.includes(tabId), 'Session assignment must finish before search navigation');
    assert.equal(f.tabs.find(tab => tab.id === tabId)?.active, false);
  };
  await launcher.launch('search text', f.caller);
  assert.deepEqual(assigned, f.tabs.map(tab => tab.id));
});

test('failed search removes only an untouched inactive blank tab', async () => {
  const f = fixture();
  f.api.search.search = async () => { throw new Error('No search engine'); };
  await assert.rejects(f.launcher.launch('query text', f.caller), /No search engine/);
  assert.equal(f.tabs.length, 0);
  f.api.search.search = async ({ tabId }) => {
    (await f.api.tabs.get(tabId)).url = 'https://user-changed.example';
    throw new Error('Late failure');
  };
  await assert.rejects(f.launcher.launch('query text', f.caller), /Late failure/);
  assert.equal(f.tabs[0].url, 'https://user-changed.example');
});
