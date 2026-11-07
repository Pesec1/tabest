import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file: string) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('Tabest metadata, versions and MIT license agree across package and extension', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const manifest = JSON.parse(read('public/manifest.json'));
  assert.equal(pkg.name, 'tabest');
  assert.equal(lock.name, pkg.name);
  assert.equal(lock.packages[''].name, pkg.name);
  assert.equal(manifest.name, 'Tabest — Fuzzy Tab Finder');
  assert.equal(manifest.version, pkg.version);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(pkg.license, 'MIT');
  assert.equal(lock.packages[''].license, pkg.license);
  assert.equal(manifest.action.default_title, 'Open Tabest');
  assert.match(manifest.commands['toggle-picker'].description, /Tabest/);
  assert.equal(pkg.author, undefined);
  assert.equal(pkg.repository, undefined);
});

test('public UI and documents use Tabest, not retired product names', () => {
  assert.match(read('picker.html'), /<title>Tabest · Tabs<\/title>/);
  assert.match(read('src/picker.ts'), /aria-label="Tabest home"/);
  assert.match(read('src/picker.ts'), /Your Tabest\./);
  assert.match(read('src/preview-view.ts'), /Load Tabest/);
  for (const file of ['README.md', 'PRIVACY.md', 'BUILDING.md', 'CONTRIBUTING.md',
    'CHANGELOG.md', 'docs/amo-listing.md', 'docs/github-description.md',
    'docs/reviewer-notes.md', 'docs/release-checklist.md', '.agents/AGENTS.md']) {
    const content = read(file);
    assert.match(content, /Tabest/, file);
    assert.doesNotMatch(content, /Tabscope|Telescope Browser/, file);
  }
});

test('renaming preserves the installed add-on identity and existing demo preferences', () => {
  const manifest = JSON.parse(read('public/manifest.json'));
  assert.equal(manifest.browser_specific_settings.gecko.id, 'telescope-browser@local.invalid');
  const picker = read('src/picker.ts');
  for (const key of ['telescope-settings', 'telescope-tab-filter']) {
    assert(picker.includes(`localStorage.setItem('${key}'`));
    assert(picker.includes(`localStorage.getItem('${key}'`));
  }
});

test('MIT file retains permissions, attribution condition and disclaimers', () => {
  const license = read('LICENSE');
  assert(license.startsWith('MIT License\n'));
  assert.match(license, /Copyright \(c\) 2026 Tabest contributors/);
  assert.match(license, /Permission is hereby granted, free of charge/);
  assert.match(license, /sublicense, and\/or sell/);
  assert.match(license, /copyright notice and this permission notice shall be included/);
  assert.match(license, /WITHOUT WARRANTY OF ANY KIND/);
  assert.match(license, /AUTHORS OR COPYRIGHT HOLDERS BE LIABLE/);
  assert.doesNotMatch(license, /\[year\]|\[fullname\]|<YEAR>|<COPYRIGHT HOLDER>/);
});
