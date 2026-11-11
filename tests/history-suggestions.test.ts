import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HistorySuggestions, historyUrl, rankHistory } from '../src/history-suggestions.ts';
import { SuggestionSearch } from '../src/suggestion-search.ts';

const item = (url: string, visitCount = 1, lastVisitTime = 1000): browser.history.HistoryItem => ({ id: url, url, title: 'Project notes', visitCount, lastVisitTime });
const caller: browser.tabs.Tab = { id: 99, windowId: 1, active: true, pinned: false, incognito: false };
const wait = () => new Promise(resolve => setTimeout(resolve, 5));

test('history permits web addresses and canonicalizes anchors/default ports only', () => {
  assert.equal(historyUrl('https://example.com:443/a#part'), 'https://example.com/a');
  assert.notEqual(historyUrl('https://example.com/?q=a'), historyUrl('https://example.com/?q=b'));
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/page', 'about:config', 'https://user:secret@example.com', 'invalid']) assert.equal(historyUrl(url), undefined);
});

test('history ranking uses frequency, recency, all query terms and de-duplicates open pages', () => {
  const items = [item('https://example.com/rare', 1), item('https://example.com/frequent', 40),
    item('https://example.com/frequent#part', 2), item('https://example.com/open#other', 90),
    item('javascript:notes'), { ...item('https://example.com/unrelated'), title: 'Unrelated' }];
  const ranked = rankHistory(items, 'project notes', ['https://example.com/open#here'], 1000);
  assert.deepEqual(ranked.map(row => row.url), ['https://example.com/frequent', 'https://example.com/rare']);
  assert(ranked.every(row => row.titlePositions.length > 0));
  assert.equal(rankHistory(items, 'project absent', [], 1000).length, 0);
  assert.equal(rankHistory(items, '', [], 1000).length, 0);
  const byRecency = rankHistory([item('https://example.com/old', 1, 0), item('https://example.com/new', 1, 1000)], 'notes', [], 1000);
  assert.equal(byRecency[0].url, 'https://example.com/new');
  assert.equal(rankHistory(Array.from({ length: 10 }, (_, i) => item(`https://example.com/${i}`)), 'notes', [], 1000).length, 5);
});

function fixture() {
  let enabled = true;
  let permission = true;
  let calls = 0;
  const api = {
    history: { search: async (query: { text: string; startTime: number; maxResults: number }) => {
      calls++; assert.equal(query.startTime, 0); assert.equal(query.maxResults, 100);
      return [item('https://example.com/notes'), item('https://example.com/open')];
    } },
    storage: { local: { get: async () => ({ settings: { historySuggestions: enabled } }) } },
    permissions: { contains: async () => permission },
    tabs: { query: async () => [{ ...caller, id: 1, url: 'https://example.com/open#section' }] },
  } as unknown as Pick<typeof browser, 'history' | 'storage' | 'permissions' | 'tabs'>;
  const history = new HistorySuggestions(api);
  return { api, history, calls: () => calls, disable: () => { enabled = false; }, revoke: () => { permission = false; } };
}

test('history reads require opt-in, permission, a nonempty query and a normal window', async () => {
  const f = fixture();
  assert.deepEqual(await f.history.search('notes', { ...caller, incognito: true }), []);
  assert.deepEqual(await f.history.search('', caller), []);
  assert.deepEqual(await f.history.search('n'.repeat(257), caller), []);
  f.revoke(); assert.deepEqual(await f.history.search('notes', caller), []);
  f.disable(); assert.deepEqual(await f.history.search('notes', caller), []);
  assert.equal(f.calls(), 0);
});

test('only suggestions offered to the caller can open; revocation and deletion invalidate them', async () => {
  const f = fixture();
  const rows = await f.history.search('notes', caller);
  assert.equal(rows.length, 1);
  assert.equal(await f.history.resolve(rows[0].url, caller), rows[0].url);
  await assert.rejects(f.history.resolve('https://unoffered.example', caller), /no longer available/);
  await assert.rejects(f.history.resolve(rows[0].url, { ...caller, id: 100 }), /no longer available/);
  await assert.rejects(f.history.resolve(rows[0].url, { ...caller, incognito: true }), /no longer available/);
  f.history.clear(); await assert.rejects(f.history.resolve(rows[0].url, caller), /no longer available/);
  await f.history.search('notes', caller); f.revoke();
  await assert.rejects(f.history.resolve(rows[0].url, caller), /no longer available/);
});

test('revocation or deletion while a history read is pending prevents a late result', async () => {
  for (const reason of ['revoke', 'clear'] as const) {
    const f = fixture();
    let finish!: (rows: browser.history.HistoryItem[]) => void;
    f.api.history.search = () => new Promise(resolve => { finish = resolve; });
    const pending = f.history.search('notes', caller);
    await wait();
    if (reason === 'revoke') f.revoke(); else f.history.clear();
    finish([item('https://example.com/notes')]);
    assert.deepEqual(await pending, []);
  }
});

test('older browser queries cannot replace the currently offered selection', async () => {
  const f = fixture();
  const finishes: ((rows: browser.history.HistoryItem[]) => void)[] = [];
  f.api.history.search = () => new Promise(resolve => { finishes.push(resolve); });
  const old = f.history.search('notes', caller); await wait();
  const current = f.history.search('notes new', caller); await wait();
  finishes[1]([{ ...item('https://example.com/new'), title: 'Notes new' }]);
  const rows = await current;
  finishes[0]([item('https://example.com/old')]);
  assert.deepEqual(await old, []);
  assert.equal(await f.history.resolve(rows[0].url, caller), rows[0].url);
});

test('typing debounce cancels obsolete requests, ignores late replies and clears disabled suggestions', async () => {
  const finishes: ((rows: import('../src/model.ts').HistorySuggestion[]) => void)[] = [];
  let changes = 0;
  const loads: string[] = [];
  const search = new SuggestionSearch(query => {
    loads.push(query); return new Promise(resolve => { finishes.push(resolve); });
  }, () => { changes++; }, 0);
  search.update('first', true); search.update('second', true);
  await wait(); assert.deepEqual(loads, ['second']);
  search.update('third', true); await wait();
  const rows = rankHistory([item('https://example.com/notes')], 'notes', []);
  finishes[1](rows); await wait(); assert.deepEqual(search.items, rows);
  finishes[0]([]); await wait(); assert.deepEqual(search.items, rows); assert.equal(changes, 1);
  search.update('third', true); await wait(); assert.equal(loads.length, 2);
  search.update('third', false); assert.deepEqual(search.items, []); assert.equal(search.state, 'idle');
});
