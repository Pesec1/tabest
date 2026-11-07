import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterTabs, readTabFilter } from '../src/filters.ts';
import { searchTabs } from '../src/search.ts';
import type { TabItem } from '../src/model.ts';

const tabs: TabItem[] = [
  { id: 1, windowId: 1, title: 'API', url: 'https://example.org', lastUsed: 10, pinned: false, audible: false, muted: false, discarded: false, origin: false },
  { id: 2, windowId: 1, title: 'API docs', url: 'https://example.org/docs', lastUsed: 20, pinned: true, audible: false, muted: false, discarded: false, origin: false },
  { id: 3, windowId: 2, title: 'API reference', url: 'https://example.org/reference', lastUsed: 30, pinned: true, audible: false, muted: false, discarded: true, origin: false },
];
test('tab filter and window scope compose independently', () => {
  assert.deepEqual(filterTabs(tabs, 1, 'all', 'all').map(tab => tab.id), [1, 2, 3]);
  assert.deepEqual(filterTabs(tabs, 1, 'window', 'all').map(tab => tab.id), [1, 2]);
  assert.deepEqual(filterTabs(tabs, 1, 'all', 'pinned').map(tab => tab.id), [2, 3]);
  assert.deepEqual(filterTabs(tabs, 1, 'window', 'pinned').map(tab => tab.id), [2]);
});
test('filtering preserves original ranking for empty and nonempty queries', () => {
  for (const query of ['', 'api', 'docs']) {
    assert.deepEqual(searchTabs(filterTabs(tabs, 1, 'all', 'pinned'), query).map(result => result.tab.id),
      searchTabs(tabs, query).filter(result => result.tab.pinned).map(result => result.tab.id));
  }
});
test('filter supports empty results and reacts to unpinning without mutating input', () => {
  const changed = tabs.map(tab => ({ ...tab, pinned: false }));
  assert.deepEqual(filterTabs(changed, 1, 'all', 'pinned'), []);
  assert.equal(tabs[1].pinned, true);
});
test('saved filter validates unknown values', () => {
  assert.equal(readTabFilter('pinned'), 'pinned');
  for (const value of ['all', 'invalid', undefined, null, {}]) assert.equal(readTabFilter(value), 'all');
});
