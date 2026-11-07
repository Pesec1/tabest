import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuzzyMatch, searchTabs } from '../src/search.ts';
import type { TabItem } from '../src/model.ts';

function tab(id: number, title: string, options: Partial<TabItem> = {}): TabItem {
  return { id, title, url: 'https://example.org', windowId: 1, lastUsed: id,
    pinned: false, audible: false, muted: false, discarded: false, origin: false, ...options };
}

test('fuzzy matches noncontiguous characters, case-insensitively', () => {
  assert.deepEqual(fuzzyMatch('Telescope', 'tSc')?.positions, [0, 4, 5]);
  assert.equal(fuzzyMatch('tabs', 'xyz'), null);
  assert.equal(fuzzyMatch('ab', 'aba'), null);
});
test('dynamic matching chooses a later contiguous match over scattered characters', () => {
  assert.deepEqual(fuzzyMatch('a___b___c abc', 'abc')?.positions, [10, 11, 12]);
});
test('consecutive matches and word boundaries rank higher', () => {
  assert.ok(fuzzyMatch('tab atlas', 'tab')!.score > fuzzyMatch('t_a_b', 'tab')!.score);
  assert.ok(fuzzyMatch('foo tab', 'tab')!.score > fuzzyMatch('footab', 'tab')!.score);
});
test('tokens can match different fields, and every token must match', () => {
  const tabs = [tab(1, 'API reference', { url: 'https://mozilla.org' }), tab(2, 'API reference')];
  assert.deepEqual(searchTabs(tabs, 'api moz').map(result => result.tab.id), [1]);
});
test('relevance takes precedence over recency', () => {
  assert.equal(searchTabs([tab(1, 'telescope', { lastUsed: 1 }), tab(2, 't_e_l_e', { lastUsed: 9999 })], 'tele')[0].tab.id, 1);
});
test('empty query sorts by recency, moving the originating tab to the end', () => {
  const tabs = [tab(1, 'A', { lastUsed: 500, origin: true }), tab(2, 'B', { lastUsed: 100 }), tab(3, 'C', { lastUsed: 200 })];
  assert.deepEqual(searchTabs(tabs, '  ').map(result => result.tab.id), [3, 2, 1]);
});
test('match positions reference original title and URL for highlighting', () => {
  const [result] = searchTabs([tab(1, 'Mozilla API', { url: 'https://mozilla.org' })], 'api moz');
  assert.equal(result.titlePositions.map(i => result.tab.title[i]).join(''), 'APIMoz');
  assert.ok(result.urlPositions.length > 0);
});
test('ties resolve deterministically by tab id', () => {
  assert.deepEqual(searchTabs([tab(2, 'same', { lastUsed: 1 }), tab(1, 'same')], 'same').map(result => result.tab.id), [1, 2]);
});
