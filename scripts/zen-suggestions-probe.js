// Synthetic history in the disposable profile only. Port 9 is blocked by the
// browser, so the opening check never contacts a website or starts a server.
const base = 'http://127.0.0.1:9/tabest-auto/';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function until(predicate, message) {
  for (let i = 0; i < 100; i++) { if (await predicate()) return; await wait(30); }
  throw new Error(message);
}
const el = id => document.getElementById(id);
const query = el('query');
const key = value => query.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
const historyRows = () => [...document.querySelectorAll('.history-result')];
const selected = () => document.querySelector('.result.selected')?.dataset.key;
function search(text) {
  if (query.readOnly) key('i');
  query.value = text; query.dispatchEvent(new Event('input', { bubbles: true }));
}
try {
  await until(() => document.querySelector('.result'), 'No initial results');
  const pickerId = (await browser.tabs.getCurrent()).id;
  el('settings-button').click();
  const checkbox = el('history-suggestions');
  assert(!checkbox.checked, 'History should require opt-in');
  const request = browser.permissions.request;
  browser.permissions.request = async () => false;
  checkbox.checked = true; checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => !checkbox.checked && !checkbox.disabled, 'Denied permission did not reset checkbox');
  browser.permissions.request = request;
  el('settings-dialog').close();
  const denied = await browser.runtime.sendMessage({ type: 'history', query: 'tabest-auto', pickerId });
  assert(denied.ok && denied.suggestions.length === 0, 'Disabled history returned data');
  document.title = 'Tabest [suggestions-grant]';
  await until(() => browser.permissions.contains({ permissions: ['history'] }), 'History permission not granted');
  for (const [index, name] of ['frequent', 'recent', 'reference', 'archive', 'guide'].entries()) {
    const visits = index === 0 ? 12 : 1;
    for (let i = 0; i < visits; i++) {
      await browser.history.addUrl({ url: base + name, title: 'Tabest auto · ' + name, visitTime: Date.now() - (i + index + 1) * 60_000 });
    }
  }
  // Permission is granted by the harness; exercise the real Settings save path.
  el('settings-button').click(); checkbox.checked = true;
  el('settings-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await until(() => !el('settings-dialog').open, 'Settings did not save');
  assert((await browser.storage.local.get('settings')).settings.historySuggestions, 'History opt-in not saved');
  search('tabest-auto');
  const initial = selected();
  const started = performance.now();
  await until(() => historyRows().length === 5, 'History suggestions did not load');
  await browser.storage.session.set({ suggestionSearchMs: performance.now() - started });
  assert(selected() === initial, 'History arrival stole selection');
  assert(historyRows()[0].dataset.history === base + 'frequent', 'Frequently visited page was not ranked first');
  assert(document.querySelector('.result-section').textContent.startsWith('Open tabs'), 'Open tabs are not first');
  key('Escape'); key('G');
  assert(document.querySelector('.history-result.selected'), 'Keyboard could not reach history');
  assert(el('action-hints').textContent.includes('Open in new tab'), 'History action hint missing');
  assert(!document.querySelector('.page-preview-image'), 'History used a tab screenshot');
  const count = (await browser.tabs.query({})).length;
  key('Tab'); key('d'); key('d'); key('p');
  await wait(100);
  assert((await browser.tabs.query({})).length === count && el('selection-count').textContent === 'No tabs marked', 'Tab management operated on history');
  key('l'); assert(historyRows().length === 0, 'Pinned filter displayed history');
  key('h'); await until(() => historyRows().length === 5, 'All tabs did not restore history');
  // Five matching live tabs suppress suggestions. Removing them restores them.
  const extra = [];
  for (let i = 0; i < 3; i++) extra.push(await browser.tabs.create({ url: base + 'open-' + i, active: false }));
  await until(() => historyRows().length === 0 && document.querySelectorAll('.result:not(.history-result)').length >= 5, 'Five-tab threshold failed');
  for (const tab of extra) await browser.tabs.remove(tab.id);
  await until(() => historyRows().length === 5, 'History did not return below threshold');
  // Clearing browser history must purge already displayed suggestions too.
  await browser.history.deleteUrl({ url: base + 'frequent' });
  await until(() => historyRows().length === 4 && !historyRows().some(row => row.dataset.history === base + 'frequent'), 'Deleted history stayed visible');
  search('tabest-auto recent'); search('tabest-auto reference');
  await until(() => historyRows().length === 1 && historyRows()[0].dataset.history === base + 'reference', 'New query was replaced by old suggestions');
  search('tabest-auto'); await until(() => historyRows().length === 4, 'History did not reset after query');
  key('Escape'); key('G');
  document.title = 'Tabest [suggestions-wide-ok]';
  await until(() => innerWidth <= 680, 'Window did not resize');
  assert(document.documentElement.scrollWidth <= innerWidth + 1, 'History rows overflow on narrow screen');
  const chosen = document.querySelector('.history-result.selected').dataset.history;
  key('Enter');
  await until(async () => (await browser.tabs.query({})).some(tab => tab.url === chosen && tab.active), 'Enter did not open the history suggestion');
  await browser.permissions.remove({ permissions: ['history'] });
  await until(() => historyRows().length === 0, 'Revoked history remained visible');
  const revoked = await browser.runtime.sendMessage({ type: 'history', query: 'tabest-auto', pickerId });
  assert(revoked.ok && revoked.suggestions.length === 0, 'Revoked permission still returned history');
  document.title = 'Tabest [suggestions-ok]';
} catch (error) { document.title = 'Tabest [suggestions-failed: ' + error.message + ']'; }
