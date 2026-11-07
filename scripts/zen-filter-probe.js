// Test-only driver injected into a disposable addon copy.
const fixtureUrl = __TABEST_FILTER_URL__;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function until(predicate, message) {
  for (let i = 0; i < 100; i++) { if (await predicate()) return; await wait(50); }
  throw new Error(message);
}
const el = id => document.getElementById(id);
const query = el('query');
const key = value => query.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
const rows = () => [...document.querySelectorAll('.result')];
const selected = () => document.querySelector('.result.selected')?.dataset.id;
const pinned = () => el('filter-pinned').getAttribute('aria-pressed') === 'true';
function search(text) {
  if (query.readOnly) key('i');
  query.value = text; query.dispatchEvent(new Event('input', { bubbles: true }));
}
try {
  await until(() => rows().length > 0, 'No initial results');
  assert(document.title === 'Tabest · Tabs', 'Picker title still uses the old product name');
  assert(document.querySelector('.brand')?.getAttribute('aria-label') === 'Tabest home', 'Picker brand is not Tabest');
  assert(document.querySelector('.brand')?.textContent.includes('tabest'), 'Visible brand is not Tabest');
  assert(el('settings-dialog').querySelector('h2').textContent === 'Your Tabest.', 'Settings brand is not Tabest');
  const reloaded = (await browser.storage.session.get('filterTestReloaded')).filterTestReloaded;
  if (!reloaded) {
    assert(!pinned(), 'New profiles must start in All tabs');
    assert(el('filter-all').querySelector('kbd').hidden, 'Insert hint should be hidden');
    assert(key('h') && key('l'), 'Insert h/l must not be intercepted');
    search(fixtureUrl + '?pinned');
    assert(rows().length === 1, 'Pinned fixture missing');
    const pinnedId = selected();
    key('Escape'); key('l'); key('l');
    assert(pinned() && selected() === pinnedId, 'l must select Pinned idempotently');
    assert(query.value === fixtureUrl + '?pinned', 'Filter cleared query');
    assert(!el('filter-pinned').querySelector('kbd').hidden, 'Normal hint missing');
    key('h'); key('h');
    assert(!pinned() && selected() === pinnedId, 'h must retain selection');
    search(fixtureUrl); key('Escape');
    while (document.querySelector('.result.selected .small-badge')?.textContent === 'PIN') key('j');
    const ordinaryId = selected();
    key('Tab');
    assert(document.querySelector('.result.marked')?.dataset.id === ordinaryId, 'Ordinary tab not marked');
    key('l');
    assert(rows().length === 1 && selected() === pinnedId, 'Pinned filter did not select first surviving result');
    assert(el('selection-count').textContent === 'No tabs marked', 'Filter left a hidden destructive selection');
    key('w');
    assert(pinned() && el('scope-window').getAttribute('aria-pressed') === 'true', 'Scope reset pinned filter');
    key('w');
    el('filter-all').click();
    assert(!pinned() && rows().length === 2 && document.activeElement === query, 'Mouse filter/focus failed');
    el('filter-pinned').click();
    assert(pinned() && selected() === pinnedId && query.value === fixtureUrl, 'Mouse filter lost query/selection');
    const panel = document.querySelector('.results-panel');
    for (const width of [280, 320, 400, 600]) {
      panel.style.width = width + 'px';
      const heading = document.querySelector('.results-heading');
      const box = panel.getBoundingClientRect();
      assert(heading.scrollWidth <= heading.clientWidth + 1, 'Filter heading overflow at ' + width);
      for (const button of heading.querySelectorAll('button')) {
        const rect = button.getBoundingClientRect();
        assert(rect.left >= box.left && rect.right <= box.right + 1, 'Clipped filter button at ' + width);
      }
    }
    panel.style.removeProperty('width');
    await until(async () => (await browser.storage.local.get('tabFilter')).tabFilter === 'pinned', 'Filter not saved');
    await browser.storage.session.set({ filterTestReloaded: true });
    location.reload();
  } else {
    assert(pinned(), 'Filter did not survive picker reload');
    search(fixtureUrl); key('Escape');
    assert(rows().length === 1, 'Persisted pinned filter not applied');
    key('p');
    await until(() => Boolean(document.querySelector('.empty h2')), 'Unpinned tab stayed in filtered list');
    assert(document.querySelector('.empty h2').textContent === 'No pinned tabs found', 'Wrong empty state');
    key('h');
    assert(!pinned() && rows().length === 2, 'h must work even with empty results');
    document.title = 'Tabest [filters-ok]';
  }
} catch (error) { document.title = 'Tabest [filters-failed: ' + error.message + ']'; }
