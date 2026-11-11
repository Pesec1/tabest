import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultKeymap, eventKey, KeyResolver, readSettings, validateKeymap } from '../src/keys.ts';

test('insert Escape changes mode, normal Escape cancels', () => {
  const resolver = new KeyResolver();
  assert.equal(resolver.resolve('Escape', 'insert', defaultKeymap).action, 'normal');
  assert.equal(resolver.resolve('Escape', 'normal', defaultKeymap).action, 'cancel');
});
test('plain insert characters are left to the input', () => {
  assert.equal(new KeyResolver().resolve('j', 'insert', defaultKeymap).handled, false);
});
test('gg and dd require consecutive keys within the timeout', () => {
  const resolver = new KeyResolver();
  assert.deepEqual(resolver.resolve('g', 'normal', defaultKeymap, 1000), { handled: true });
  assert.equal(resolver.resolve('g', 'normal', defaultKeymap, 1300).action, 'first');
  resolver.resolve('d', 'normal', defaultKeymap, 2000);
  assert.equal(resolver.resolve('d', 'normal', defaultKeymap, 3000).action, undefined);
  assert.equal(resolver.resolve('d', 'normal', defaultKeymap, 3100).action, 'close');
});
test('intervening keys and mode changes clear sequences', () => {
  const resolver = new KeyResolver();
  resolver.resolve('d', 'normal', defaultKeymap, 1000);
  resolver.resolve('j', 'normal', defaultKeymap, 1100);
  assert.equal(resolver.resolve('d', 'normal', defaultKeymap, 1200).action, undefined);
  resolver.reset();
  assert.equal(resolver.resolve('d', 'normal', defaultKeymap, 1250).action, undefined);
});
test('shifted printable keys and modifiers normalize correctly', () => {
  const key = (key: string, mods = {}) => eventKey({ key, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...mods });
  assert.equal(key('G', { shiftKey: true }), 'G');
  assert.equal(key('?', { shiftKey: true }), '?');
  assert.equal(key('Tab', { shiftKey: true }), 'Shift+Tab');
  assert.equal(key('n', { ctrlKey: true }), 'Ctrl+n');
});
test('settings reject unknown actions and recover from malformed persisted values', () => {
  assert.equal(validateKeymap({ insert: {}, normal: { x: 'deleteEverything' } }), false);
  assert.equal(validateKeymap({ insert: [], normal: {} }), false);
  assert.equal(validateKeymap(defaultKeymap), true);
  assert.equal(readSettings({ theme: 'invalid', scope: 'invalid', keymap: {} }).theme, 'dark');
  assert.deepEqual(readSettings(null).keymap, defaultKeymap);
});
test('custom bindings resolve to actions', () => {
  assert.equal(new KeyResolver().resolve('x', 'normal', { insert: {}, normal: { x: 'close' } }).action, 'close');
});
test('h/l choose explicit tab filters only in Normal mode', () => {
  const resolver = new KeyResolver();
  for (let i = 0; i < 2; i++) {
    assert.equal(resolver.resolve('h', 'normal', defaultKeymap).action, 'allTabs');
    assert.equal(resolver.resolve('l', 'normal', defaultKeymap).action, 'pinnedTabs');
  }
  for (const key of ['h', 'l']) assert.equal(resolver.resolve(key, 'insert', defaultKeymap).handled, false);
  assert.equal(resolver.resolve('w', 'normal', defaultKeymap).action, 'scope');
  assert.equal(resolver.resolve('p', 'normal', defaultKeymap).action, 'pin');
});
test('legacy saved keymaps gain filter bindings without overwriting custom keys or sequences', () => {
  const legacy = structuredClone(defaultKeymap);
  delete legacy.normal.h; delete legacy.normal.l;
  const upgraded = readSettings({ keymap: legacy });
  assert.equal(upgraded.keymap.normal.h, 'allTabs');
  assert.equal(upgraded.keymap.normal.l, 'pinnedTabs');
  assert.equal(legacy.normal.h, undefined);
  legacy.normal.h = 'help'; legacy.normal.ll = 'last';
  const custom = readSettings({ keymap: legacy }).keymap;
  assert.equal(custom.normal.h, 'help');
  assert.equal(custom.normal.l, undefined);
  assert.equal(custom.normal.ll, 'last');
});
test('versioned maps may omit filter bindings or assign them elsewhere', () => {
  const keymap = { insert: {}, normal: { x: 'pinnedTabs' as const } };
  assert.deepEqual(readSettings({ keymapVersion: 2, keymap }).keymap, keymap);
  assert.equal(readSettings({ keymap }).keymap.normal.l, undefined);
  assert.equal(validateKeymap(keymap), true);
});

test('view preferences default safely and preserve existing custom settings', () => {
  const legacy = { theme: 'light', scope: 'window', keymapVersion: 2, keymap: { insert: {}, normal: { x: 'close' } } };
  const settings = readSettings(legacy);
  assert.equal(settings.layout, 'compact');
  assert.equal(settings.showPreview, true);
  assert.deepEqual(settings.keymap, legacy.keymap);
  assert.equal(settings.theme, 'light');
  assert.equal(settings.scope, 'window');
  assert.equal(readSettings({ ...legacy, layout: 'comfortable', showPreview: false }).layout, 'comfortable');
  assert.equal(readSettings({ ...legacy, showPreview: false }).showPreview, false);
  assert.equal(readSettings({ layout: 'invalid', showPreview: 'invalid' }).showPreview, true);
});
