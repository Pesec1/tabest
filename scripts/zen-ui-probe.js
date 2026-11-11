// UI regression checks injected only into the disposable test extension.
const fixtureUrl = __TABEST_UI_URL__;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function until(predicate, message) {
  for (let i = 0; i < 100; i++) { if (await predicate()) return; await wait(50); }
  throw new Error(message);
}
const el = id => document.getElementById(id);
const root = document.documentElement;
const query = el('query');
const key = value => query.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
const hints = () => el('action-hints').textContent;
function search(text) {
  if (query.readOnly) key('i');
  query.value = text; query.dispatchEvent(new Event('input', { bubbles: true }));
}
try {
  await until(() => document.querySelector('.result'), 'No results');
  const reloaded = (await browser.storage.session.get('uiReloaded')).uiReloaded;
  if (!reloaded) {
    assert(root.dataset.layout === 'compact', 'Compact must be the default');
    search(fixtureUrl);
    assert(document.querySelectorAll('.result').length === 2, 'Fixture results missing');
    const selected = document.querySelector('.result.selected').dataset.id;
    const compactTop = query.getBoundingClientRect().top;
    const compactRowHeight = document.querySelector('.result').getBoundingClientRect().height;
    const compactListHeight = el('results').getBoundingClientRect().height;
    assert(compactTop < 120, 'Compact search is too far down');
    await until(() => document.querySelector('.result.selected .tab-icon img')?.naturalWidth > 0 &&
      document.querySelector('.preview-icon img')?.naturalWidth > 0, 'Browser favicon missing from row or preview');
    assert(document.querySelector('.tab-icon img').referrerPolicy === 'no-referrer', 'Favicon must omit referrer');
    el('layout-button').click();
    await until(() => root.dataset.layout === 'comfortable', 'Layout did not toggle');
    assert(query.getBoundingClientRect().top > compactTop + 100, 'Comfortable layout did not restore intro');
    assert(document.querySelector('.result').getBoundingClientRect().height > compactRowHeight, 'Compact rows are not denser');
    assert(el('results').getBoundingClientRect().height < compactListHeight, 'Compact view does not show more results');
    assert(query.value === fixtureUrl && document.querySelector('.result.selected').dataset.id === selected, 'View change lost query or selection');
    el('preview-button').click();
    await until(() => root.dataset.preview === 'false', 'Preview toggle failed');
    assert(getComputedStyle(document.querySelector('.preview-panel')).display === 'none', 'Preview still visible');
    assert(document.activeElement === query, 'Toggle did not restore focus');
    assert(!hints().includes('dd'), 'Insert displays inactive close binding');
    key('Tab'); key('Escape');
    assert(hints().includes('ddClose 1 marked'), 'Marked close hint missing');
    key('Tab');
    assert(hints().includes('Close 2 marked'), 'Multiple mark count missing');
    const settings = (await browser.storage.local.get('settings')).settings;
    settings.keymap.normal.x = 'close'; delete settings.keymap.normal.dd;
    await browser.storage.local.set({ settings });
    await until(() => hints().includes('xClose 2 marked'), 'Hints ignored custom bindings');
    assert(!hints().includes('dd'), 'Old binding still advertised');
    search('no-such-tab-unique-query');
    assert(!hints().includes('Switch') && !hints().includes('Pin tab'), 'Empty results advertise unavailable tab actions');
    assert(hints().includes('Manage marked tabs'), 'Hidden marked selection is undisclosed');
    await browser.storage.session.set({ uiReloaded: true });
    location.reload();
  } else {
    assert(root.dataset.layout === 'comfortable' && root.dataset.preview === 'false', 'View preferences did not survive reload');
    key('Escape');
    assert(hints().includes('xClose tab'), 'Custom close binding did not survive reload');
    search('about:blank');
    const fallback = document.querySelector('.tab-icon');
    assert(fallback && !fallback.querySelector('img') && fallback.textContent.length === 1, 'Missing-icon fallback failed');
    el('layout-button').click();
    await until(() => root.dataset.layout === 'compact', 'Compact could not be restored');
    // Result panel constraints exercise wrapped filters and action hints together.
    const panel = document.querySelector('.results-panel');
    for (const width of [280, 320, 400, 600]) {
      panel.style.width = width + 'px';
      for (const element of [panel, el('action-hints'), document.querySelector('.results-bottom')]) {
        assert(element.scrollWidth <= element.clientWidth + 1, 'UI overflows at width ' + width);
      }
    }
    panel.style.removeProperty('width');
    search(fixtureUrl); key('Escape'); key('Tab');
    el('preview-button').click();
    await until(() => root.dataset.preview === 'true', 'Preview could not be restored');
    await until(() => document.querySelector('.preview-icon img')?.naturalWidth > 0, 'Restored preview icon missing');
    document.title = 'Tabest [ui-wide-ok]';
    await until(() => innerWidth <= 680, 'Window did not resize to narrow viewport');
    assert(root.scrollWidth <= root.clientWidth + 1, 'Horizontal page overflow at narrow viewport');
    assert(getComputedStyle(document.querySelector('.preview-panel')).display === 'none', 'Preview visible on narrow screen');
    assert(el('results').clientHeight > 150, 'Narrow screen has insufficient results space');
    assert(document.querySelector('.statusbar').getBoundingClientRect().bottom <= innerHeight + 1, 'Status bar falls below viewport');
    document.title = 'Tabest [ui-ok]';
  }
} catch (error) { document.title = 'Tabest [ui-failed: ' + error.message + ']'; }
