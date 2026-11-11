import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionHints } from '../src/action-hints.ts';
import { readSettings } from '../src/keys.ts';

test('Insert hints lead to Normal actions without advertising inactive bindings', () => {
  const hints = actionHints(readSettings(null), 'insert', 3, true, false, false);
  assert.deepEqual(hints.find(hint => hint.key === 'Escape'), { key: 'Escape', label: 'Manage marked tabs' });
  assert(!hints.some(hint => hint.key === 'dd' || hint.key === 'p'));
});

test('Normal hints distinguish marked closure and single-tab pinning', () => {
  const hints = actionHints(readSettings(null), 'normal', 3, true, true, true);
  assert.deepEqual(hints.find(hint => hint.key === 'dd'), { key: 'dd', label: 'Close 3 marked' });
  assert.deepEqual(hints.find(hint => hint.key === 'p'), { key: 'p', label: 'Unpin tab' });
  assert.deepEqual(hints.find(hint => hint.key === 'Tab'), { key: 'Tab', label: 'Unmark' });
});

test('hints respect remapped and deliberately removed bindings', () => {
  const settings = readSettings({ keymapVersion: 2, keymap: { insert: {}, normal: { x: 'close' } } });
  assert.deepEqual(actionHints(settings, 'normal', 0, true, false, false), [{ key: 'x', label: 'Close tab' }]);
  assert.deepEqual(actionHints(settings, 'insert', 2, true, false, false), []);
});

test('empty results offer return/filter while hidden marks still disclose closure', () => {
  const settings = readSettings(null);
  assert.deepEqual(actionHints(settings, 'normal', 0, false, false, false), [
    { key: 'h', label: 'All tabs' }, { key: 'Escape', label: 'Return' },
  ]);
  assert(actionHints(settings, 'normal', 2, false, false, false).some(hint => hint.label === 'Close 2 marked'));
});
