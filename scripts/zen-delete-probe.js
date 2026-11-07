// Test-only UI driver, injected into a disposable copy of the addon.
const fixtures = __TABEST_DELETE_FIXTURES__;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, message) {
  for (let i = 0; i < 100; i++) { if (await predicate()) return; await wait(50); }
  throw new Error(message);
}
const key = value => document.getElementById('query').dispatchEvent(new KeyboardEvent('keydown', {
  key: value, bubbles: true, cancelable: true,
}));
function search(url) {
  const input = document.getElementById('query');
  if (input.readOnly) key('i');
  input.value = url; input.dispatchEvent(new Event('input', { bubbles: true }));
}
async function assertDeleted(delay = 300) {
  if (delay) await wait(delay);
  const tabs = await browser.tabs.query({});
  if (tabs.some(tab => tab.url === fixtures.victim)) throw new Error('Deleted tab returned in browser.tabs.query');
}
try {
  await until(() => document.querySelectorAll('.result').length > 0, 'Results did not load');
  const stage = (await browser.storage.session.get('deleteTestStage')).deleteTestStage ?? 0;
  if (stage === 0) {
    search(fixtures.victim);
    await until(() => document.querySelector('.result.selected .result-url')?.textContent === fixtures.victim, 'Victim was not selected');
    await wait(160);
    key('Escape'); key('d'); key('d');
    await until(() => !Array.from(document.querySelectorAll('.result-url')).some(row => row.textContent === fixtures.victim), 'Deleted tab stayed in results');
    // Select another tab as soon as the UI reports successful removal.
    await assertDeleted(0);
    search(fixtures.targetB); key('Enter');
    await until(() => document.hidden, 'Selecting target B did not leave the picker');
    await assertDeleted();
    document.title = 'Tabest [delete-step1-ok]';
    await until(() => !document.hidden, 'Picker was not reopened after target B');
    await wait(100);
    search(fixtures.targetC); key('Enter');
    await until(() => document.hidden, 'Selecting target C did not leave the picker');
    await assertDeleted();
    await browser.storage.session.set({ deleteTestStage: 1 });
    document.title = 'Tabest [delete-step2-ok]';
  } else {
    search(fixtures.targetB); key('Enter');
    await until(() => document.hidden, 'Selecting after a fresh picker did not leave it');
    await assertDeleted();
    document.title = 'Tabest [delete-step3-ok]';
  }
} catch (error) { document.title = 'Tabest [delete-failed: ' + error.message + ']'; }
