// Injected only into the fresh-profile test add-on; all pages are synthetic.
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function until(predicate, message) {
  for (let i = 0; i < 140; i++) { if (await predicate()) return; await wait(50); }
  throw new Error(message);
}
const el = id => document.getElementById(id);
const query = el('query');
const root = document.documentElement;
const key = value => query.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
function search(text) { if (query.readOnly) key('i'); query.value = text; query.dispatchEvent(new Event('input', { bubbles: true })); }
let pickerId;
async function request(payload) {
  const reply = await Promise.race([
    browser.runtime.sendMessage({ ...payload, pickerId }),
    wait(3000).then(() => { throw new Error(`Background request timed out: ${payload.type}`); }),
  ]);
  assert(reply?.ok, reply?.error ?? 'No background reply'); return reply.snapshot;
}
const rowForSession = id => [...document.querySelectorAll('.session-result')].find(row => row.dataset.key === `session:${id}`);
try {
  await until(() => document.querySelector('.result'), 'Picker did not initialize');
  pickerId = (await browser.tabs.getCurrent()).id;
  const saved = (await browser.storage.session.get('sessionsProbe')).sessionsProbe;
  if (!saved) {
    let snapshot = await request({ type: 'snapshot' });
    assert(snapshot.workSessions.activeSessionId === 'all', 'Initial selection must be All sessions');
    assert(snapshot.workSessions.sessions.length === 0, 'Initial catalog must have no built-in sessions');
    assert(el('sessions-button').textContent.includes('All sessions'), 'Initial session label is incorrect');
    const fixtureTabs = snapshot.tabs.filter(tab => tab.url.includes('?ordinary') || tab.url.includes('?pinned'));
    assert(fixtureTabs.length === 2, 'Synthetic fixtures missing');
    const ordinary = fixtureTabs.find(tab => tab.url.includes('?ordinary'));
    let nativeBefore = await Promise.all(fixtureTabs.map(tab => browser.tabs.get(tab.id)));
    el('sessions-button').click(); search('Work'); key('Enter');
    await until(() => root.dataset.sessionPicker === 'false' && el('sessions-button').textContent.includes('Work'), 'Create session through UI failed');
    snapshot = await request({ type: 'snapshot' });
    const work = snapshot.workSessions.activeSessionId;
    assert(snapshot.tabs.every(tab => !tab.sessionIds?.length), 'Empty session moved existing tabs');
    assert(!document.querySelector('.result[data-id]'), 'Empty session did not filter the browser list');
    key('Escape'); key('s');
    assert(root.dataset.mode === 'normal' && query.readOnly, 'Opening sessions changed Normal mode');
    const initialSession = document.querySelector('.result.selected')?.dataset.key;
    key('k'); assert(document.querySelector('.result.selected')?.dataset.key !== initialSession, 'Normal k did not navigate sessions');
    key('j'); key('Enter');
    await until(() => root.dataset.sessionPicker === 'false', 'Normal session selection did not finish');
    assert(root.dataset.mode === 'normal' && query.readOnly, 'Choosing a session changed Normal mode');
    key('s'); key('Escape');
    assert(root.dataset.sessionPicker === 'false' && root.dataset.mode === 'normal', 'Cancelling session choice changed Normal mode');
    key('s'); key('i'); search('Work'); key('Enter');
    await until(() => root.dataset.sessionPicker === 'false', 'Insert session selection did not finish');
    assert(root.dataset.mode === 'insert' && !query.readOnly, 'Explicit Insert mode was reverted after selecting a session');
    el('sessions-button').click(); key('Escape');
    assert(root.dataset.sessionPicker === 'false' && root.dataset.mode === 'insert', 'Cancelling session choice changed Insert mode');
    assert(el('empty-session-new-tab'), 'Empty session must offer direct new-tab creation');
    el('empty-session-new-tab').click();
    await until(async () => (await request({ type: 'snapshot' })).tabs.some(tab => tab.sessionIds?.includes(work)), 'Direct empty-session tab creation failed');
    await browser.tabs.update(pickerId, { active: true }); await wait(150);
    nativeBefore = await Promise.all(fixtureTabs.map(tab => browser.tabs.get(tab.id)));
    search('?'); key('Tab'); key('Tab');
    assert(el('selection-count').textContent.includes('2 tabs'), 'Bulk marks failed');
    el('action-hints').querySelector('.move-session-button').click();
    rowForSession(work).click();
    await until(() => root.dataset.sessionPicker === 'false', 'Bulk move chooser did not close');
    snapshot = await request({ type: 'snapshot' });
    assert(fixtureTabs.every(tab => snapshot.tabs.find(item => item.id === tab.id)?.sessionIds?.includes(work)), 'Bulk move membership incorrect');
    for (const previous of nativeBefore) {
      const current = await browser.tabs.get(previous.id);
      assert(current.pinned === previous.pinned && current.hidden === previous.hidden && current.windowId === previous.windowId && current.index === previous.index, 'Sessions changed native tab organization');
    }
    const otherSnapshot = await request({ type: 'session-create', name: 'Other', ids: [ordinary.id] });
    const other = otherSnapshot.workSessions.activeSessionId;
    await request({ type: 'session-switch', sessionId: work });
    search('?ordinary');
    await until(() => document.querySelector('.session-badge')?.textContent === 'Other', 'Global search omitted another session or its badge');
    const beforeSharing = new Set((await browser.tabs.query({})).map(tab => tab.id));
    key('Enter');
    await until(async () => {
      const ids = (await request({ type: 'snapshot' })).tabs.find(tab => tab.id === ordinary.id)?.sessionIds ?? [];
      return ids.length === 2 && ids.includes(work) && ids.includes(other);
    }, 'Search selection must add membership while retaining the original session');
    assert((await browser.tabs.query({})).every(tab => beforeSharing.has(tab.id)), 'Search selection duplicated a native tab');
    await browser.tabs.update(pickerId, { active: true }); await wait(150);
    await until(() => document.querySelector(`.result[data-id="${ordinary.id}"]`), 'Shared tab missing in current session');
    el('sessions-button').click(); rowForSession(other).click();
    await until(() => root.dataset.sessionPicker === 'false' && el('sessions-button').textContent.includes('Other'), 'Could not switch to original session');
    assert(document.querySelector(`.result[data-id="${ordinary.id}"]`), 'Sharing removed the tab from its original session');
    el('sessions-button').click(); rowForSession(work).click();
    await until(() => root.dataset.sessionPicker === 'false' && el('sessions-button').textContent.includes('Work'), 'Could not return to current session');
    search('?ordinary');
    const badge = document.querySelector('.result.selected .session-badge');
    assert(badge?.title.includes('Work') && badge.title.includes('Other'), 'Shared session labels are incomplete');
    key('Escape'); key('m');
    assert(root.dataset.sessionPicker === 'true', 'Normal m did not open Move');
    assert(root.dataset.mode === 'normal' && query.readOnly, 'Move chooser changed Normal mode');
    search('New destination'); key('Enter');
    await until(() => root.dataset.sessionPicker === 'false' && el('sessions-button').textContent.includes('New destination'), 'Create from selected tab failed');
    assert(root.dataset.mode === 'insert' && !query.readOnly, 'Create-and-move reverted the explicitly chosen Insert mode');
    snapshot = await request({ type: 'snapshot' });
    const destination = snapshot.workSessions.activeSessionId;
    assert(snapshot.tabs.find(tab => tab.id === ordinary.id).sessionIds?.includes(destination), 'Create-and-move failed');
    el('sessions-button').click();
    rowForSession(destination).querySelector('button').click();
    await until(() => el('session-name-dialog').open, 'Rename dialog missing');
    el('session-name').value = 'Renamed';
    el('session-name-form').requestSubmit();
    await until(() => !el('session-name-dialog').open && el('sessions-button').textContent.includes('Renamed'), 'Rename failed');
    key('Escape');
    const beforeTabs = await browser.tabs.query({});
    document.title = 'Tabest [sessions-ctrl-t-ready]';
    await until(async () => (await browser.tabs.query({})).some(tab => !beforeTabs.some(old => old.id === tab.id) && tab.url === 'about:blank'), 'Native Ctrl+T did not create a tab');
    const created = (await browser.tabs.query({})).find(tab => !beforeTabs.some(old => old.id === tab.id) && tab.url === 'about:blank');
    await until(async () => (await request({ type: 'snapshot' })).tabs.find(tab => tab.id === created.id)?.sessionIds?.includes(destination), 'Native Ctrl+T did not inherit current session');
    const restoreUrl = browser.runtime.getURL('session-fixture.html');
    const child = await browser.tabs.create({ url: restoreUrl, active: false, openerTabId: fixtureTabs.find(tab => tab.id !== ordinary.id).id });
    await until(async () => (await request({ type: 'snapshot' })).tabs.find(tab => tab.id === child.id)?.sessionIds?.includes(work), 'Background link did not inherit source session');
    await until(async () => (await browser.tabs.get(child.id)).status === 'complete', 'Restore fixture did not finish loading');
    await browser.tabs.remove(child.id);
    const beforeRestore = new Set((await browser.tabs.query({})).map(tab => tab.id));
    document.title = 'Tabest [sessions-restore-ready]';
    try {
      await until(async () => (await request({ type: 'snapshot' })).tabs.some(tab => !beforeRestore.has(tab.id) && tab.url === restoreUrl && tab.sessionIds?.includes(work)), 'Browser Ctrl+Shift+T restore lost tab membership');
    } catch (error) {
      const actual = (await request({ type: 'snapshot' })).tabs.map(tab => ({ id: tab.id, url: tab.url, sessionId: tab.sessionIds, newlyRestored: !beforeRestore.has(tab.id) }));
      throw new Error(error.message + ': ' + JSON.stringify(actual));
    }
    const privateWindow = await browser.windows.create({ incognito: true, url: 'about:blank' });
    document.title = 'Tabest [sessions-stage: private]';
    // This probe is an ordinary picker: private mutations must be rejected.
    const privateTab = privateWindow.tabs[0];
    const denied = await browser.runtime.sendMessage({ type: 'session-move', sessionId: work, ids: [privateTab.id], pickerId });
    assert(denied?.ok === false, 'Private tab accepted by ordinary picker');
    await browser.windows.remove(privateWindow.id);
    await browser.tabs.update(pickerId, { active: true }); await wait(150);
    await request({ type: 'session-auto', enabled: false });
    const unassigned = await browser.tabs.create({ url: 'about:blank', active: false, openerTabId: ordinary.id });
    await until(async () => (await request({ type: 'snapshot' })).tabs.find(tab => tab.id === unassigned.id)?.sessionIds?.length === 0, 'Auto-add off was ignored');
    search('http://127.0.0.1:9/tabest-session-launch');
    document.title = 'Tabest [sessions-stage: launch]';
    query.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', altKey: true, bubbles: true, cancelable: true }));
    await until(async () => (await request({ type: 'snapshot' })).tabs.some(tab => tab.url === 'http://127.0.0.1:9/tabest-session-launch' && tab.sessionIds?.includes(destination)), 'Explicit Alt+Enter did not use current session with auto-add off');
    await browser.tabs.update(pickerId, { active: true }); await wait(150);
    await request({ type: 'session-auto', enabled: true });
    await request({ type: 'session-switch', sessionId: other });
    search('?ordinary'); key('Enter');
    await until(async () => {
      const ids = (await request({ type: 'snapshot' })).tabs.find(tab => tab.id === ordinary.id)?.sessionIds ?? [];
      return ids.length === 2 && ids.includes(destination) && ids.includes(other);
    }, 'Second sharing operation lost existing membership');
    await browser.tabs.update(pickerId, { active: true }); await wait(150);
    await request({ type: 'session-switch', sessionId: destination });
    await browser.storage.session.set({ sessionsProbe: { work, other, destination, ordinaryId: ordinary.id } });
    location.reload();
  } else if (!saved.phase) {
    const snapshot = await request({ type: 'snapshot' });
    assert(snapshot.workSessions.activeSessionId === saved.destination, 'Current session lost on reload');
    assert(el('sessions-button').textContent.includes('Renamed'), 'Named session label lost on reload');
    el('sessions-button').click();
    assert(!document.querySelector('[data-key="new-session-tab"]'), 'Session chooser must not contain a new-tab action');
    assert(![...document.querySelectorAll('.session-result .result-title')].some(row => row.textContent === 'Unsorted'), 'Unsorted must not appear in the chooser');
    document.querySelector('[data-key="all-sessions"]').click();
    await until(() => root.dataset.sessionPicker === 'false' && el('sessions-button').textContent.includes('All sessions'), 'All sessions was not selected');
    assert((await request({ type: 'snapshot' })).workSessions.activeSessionId === 'all', 'All sessions choice was not saved');
    await browser.storage.session.set({ sessionsProbe: { ...saved, phase: 'all-reload' } });
    location.reload();
  } else if (saved.phase === 'all-reload') {
    const snapshot = await request({ type: 'snapshot' });
    assert(snapshot.workSessions.activeSessionId === 'all', 'All sessions lost on reload');
    assert(el('sessions-button').textContent.includes('All sessions'), 'All sessions label lost on reload');
    assert(document.querySelectorAll('.result[data-id]').length === snapshot.tabs.length, 'All sessions did not restore the complete tab list');
    el('sessions-button').click();
    assert(document.querySelector('.result.selected')?.dataset.key === 'all-sessions', 'Chooser did not highlight All sessions');
    key('Escape');
    await browser.storage.session.set({ sessionsProbe: { ...saved, phase: 'all-reopen' } });
    document.title = 'Tabest [sessions-reopen-ready]';
  } else {
    const snapshot = await request({ type: 'snapshot' });
    assert(snapshot.workSessions.activeSessionId === 'all', 'All sessions lost after picker closure and reopening');
    assert(el('sessions-button').textContent.includes('All sessions'), 'Reopened picker label is incorrect');
    assert(document.querySelectorAll('.result[data-id]').length === snapshot.tabs.length, 'Reopened picker did not show all tabs');
    assert(snapshot.tabs.find(tab => tab.id === saved.ordinaryId)?.sessionIds?.includes(saved.destination), 'Membership lost on reload');
    el('sessions-button').click(); search('wrk');
    assert(rowForSession(saved.work), 'Session search must support fuzzy matching');
    const searchBefore = query.value;
    key('Escape'); assert(root.dataset.sessionPicker === 'false' && query.value !== searchBefore, 'Escape did not restore tab search');
    await request({ type: 'session-delete', sessionId: saved.destination });
    const after = await request({ type: 'snapshot' });
    const remaining = after.tabs.find(tab => tab.id === saved.ordinaryId)?.sessionIds;
    assert(remaining?.length === 1 && remaining.includes(saved.other), 'Deleting one session removed other memberships');
    assert(await browser.tabs.get(saved.ordinaryId), 'Deleting session closed a tab');
    const longName = 'Research ' + 'with a long session name '.repeat(2);
    for (let index = 0; index < 18; index++) await request({ type: 'session-create', name: `Project ${index + 1}`, ids: [] });
    await request({ type: 'session-create', name: longName, ids: [] });
    await until(() => el('sessions-button').textContent.includes('Research'), 'Long session name did not render');
    el('sessions-button').click();
    document.title = 'Tabest [sessions-wide-ok]';
    await until(() => innerWidth <= 680, 'Narrow viewport missing');
    assert(root.scrollWidth <= root.clientWidth + 1, 'Sessions cause page overflow');
    assert(el('results').clientHeight > 150, 'Session chooser leaves too little list space');
    assert(document.querySelector('.statusbar').getBoundingClientRect().bottom <= innerHeight + 1, 'Sessions push status outside viewport');
    key('Escape');
    el('settings-button').click();
    assert(el('session-auto').checked, 'Settings do not reflect auto-add preference');
    el('settings-dialog').querySelector('.dialog-close').click();
    document.title = 'Tabest [sessions-ok]';
  }
} catch (error) { document.title = 'Tabest [sessions-failed: ' + error.message + ']'; }
