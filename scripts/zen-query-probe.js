// New-tab targets and the test default engine use a blocked loopback port.
// No real website/search provider or existing profile is contacted.
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function until(predicate, message) {
  for (let i = 0; i < 100; i++) { if (await predicate()) return; await wait(30); }
  throw new Error(message);
}
const el = id => document.getElementById(id);
const input = el('query');
const key = (value, modifiers = {}) => input.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...modifiers }));
function query(text) {
  if (input.readOnly) key('i');
  input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus();
}
try {
  await until(() => document.querySelector('.result'), 'No initial results');
  const picker = await browser.tabs.getCurrent();
  const back = async () => { await browser.tabs.update(picker.id, { active: true }); await wait(120); };
  const activeUrl = async url => (await browser.tabs.query({ active: true, windowId: picker.windowId })).some(tab => tab.url === url);
  query('127.0.0.1:9/tabest-address');
  assert(el('query-action-label').textContent === 'Open 127.0.0.1:9', 'Address action label incorrect');
  assert(el('query-action-key').textContent === 'Alt+Enter', 'Default action binding missing');
  const count = (await browser.tabs.query({})).length;
  key('Enter'); await wait(80);
  assert((await browser.tabs.query({})).length === count, 'Enter unexpectedly created a tab');
  document.title = 'Tabest [query-address-ready]';
  await until(() => activeUrl('http://127.0.0.1:9/tabest-address'), 'Native Alt+Enter did not open an address');
  await back();
  const text = 'как настроить nginx & logs';
  query(text);
  assert(el('query-action-label').textContent === 'Search the web', 'Search label incorrect');
  document.title = 'Tabest [query-search-ready]';
  await until(async () => (await browser.tabs.query({ active: true, windowId: picker.windowId })).some(tab => {
    try { const url = new URL(tab.url); return url.pathname === '/tabest-query' && url.searchParams.get('q') === text; } catch { return false; }
  }), 'Native Alt+Enter did not use the browser default test engine');
  await back();
  query('127.0.0.1:9/tabest-normal'); key('Escape'); key('Enter', { altKey: true });
  await until(() => activeUrl('http://127.0.0.1:9/tabest-normal'), 'Normal mode query action failed');
  await back();
  query('127.0.0.1:9/tabest-click'); el('query-action-button').click(); el('query-action-button').click();
  await until(() => activeUrl('http://127.0.0.1:9/tabest-click'), 'Mouse action failed');
  assert((await browser.tabs.query({})).filter(tab => tab.url === 'http://127.0.0.1:9/tabest-click').length === 1, 'Repeated click created duplicates');
  await back();
  const beforeInvalid = (await browser.tabs.query({})).length;
  query(''); assert(el('query-action').hidden, 'Empty input action is visible'); key('Enter', { altKey: true });
  query('javascript:alert(1)'); assert(el('query-action-button').disabled, 'Unsupported protocol action is enabled'); key('Enter', { altKey: true });
  await wait(80); assert((await browser.tabs.query({})).length === beforeInvalid, 'Invalid or empty query created a tab');
  const settings = (await browser.storage.local.get('settings')).settings ?? {};
  const keymap = settings.keymap ?? { insert: { Enter: 'accept', Escape: 'normal' }, normal: { i: 'insert', Escape: 'cancel' } };
  delete keymap.insert['Alt+Enter']; delete keymap.normal['Alt+Enter']; keymap.insert['Ctrl+o'] = 'launchQuery';
  await browser.storage.local.set({ settings: { ...settings, keymapVersion: 3, keymap } });
  query('127.0.0.1:9/tabest-custom');
  assert(!el('status').classList.contains('error'), 'Corrected query retained an old validation error');
  await until(() => el('query-action-key').textContent === 'Ctrl+o', 'Custom binding hint missing');
  key('o', { ctrlKey: true });
  await until(() => activeUrl('http://127.0.0.1:9/tabest-custom'), 'Custom query binding failed');
  await back();
  query('nginx configuration');
  document.title = 'Tabest [query-wide-ok]';
  await until(() => innerWidth <= 680, 'Narrow viewport unavailable');
  assert(document.documentElement.scrollWidth <= innerWidth + 1, 'Query action overflowed narrow viewport');
  assert(el('query-action-button').getBoundingClientRect().height > 0, 'Narrow query action invisible');
  document.title = 'Tabest [query-ok]';
} catch (error) { document.title = 'Tabest [query-failed: ' + error.message + ']'; }
