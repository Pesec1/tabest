// Automation only; injected into a disposable copy, never into dist/.
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, message) {
  for (let i = 0; i < 150; i++) { if (predicate()) return; await wait(50); }
  throw new Error(message);
}
const query = document.getElementById('query');
const key = value => query.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
const rows = () => [...document.querySelectorAll('.result')];
async function ready(stage) {
  await until(() => {
    const image = document.querySelector('.page-preview-image');
    return image?.complete && image.naturalWidth > 0;
  }, 'Real tab preview did not load');
  if (document.documentElement.scrollWidth > innerWidth) throw new Error('Horizontal overflow');
  const preview = document.querySelector('.preview-panel');
  if (preview.scrollHeight > preview.clientHeight + 1) throw new Error('Preview overflow');
  await document.fonts.ready;
  await wait(400);
  document.title = `Tabest [capture-${stage}-ready]`;
  // Leave each verified state visible long enough for the privileged capture.
  await wait(3000);
}
try {
  await until(() => rows().length >= 7, 'Real fixture tabs did not load');
  query.value = 'keyboard';
  query.dispatchEvent(new Event('input', { bubbles: true }));
  if (rows().length !== 1 || !document.querySelector('mark')) throw new Error('Search did not filter/highlight');
  await ready('search');
  query.value = '';
  query.dispatchEvent(new Event('input', { bubbles: true }));
  key('Escape');
  key('l');
  if (rows().length !== 3 || document.getElementById('filter-pinned').getAttribute('aria-pressed') !== 'true') throw new Error('Pinned filter did not activate');
  key('Tab');
  key('Tab');
  if (document.querySelectorAll('.result.marked').length !== 2) throw new Error('Tabs were not marked');
  if (document.getElementById('mode-indicator').textContent !== 'NORMAL') throw new Error('Normal mode missing');
  await ready('pinned');
  document.title = 'Tabest [capture-done]';
} catch (error) { document.title = `Tabest [capture-failed: ${error.message}]`; }
