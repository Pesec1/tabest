import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

// No network/debugging port, existing profile, or installed browser is modified.
const deletion = process.argv.includes('--deletion');
const filters = process.argv.includes('--filters');
const ui = process.argv.includes('--ui');
const installedBinary = realpathSync(process.argv.slice(2).find(arg => !arg.startsWith('--')) ?? process.env.TABEST_ZEN_BINARY ?? process.env.TELESCOPE_ZEN_BINARY ?? '/opt/zen-browser-bin/zen');
const temporary = mkdtempSync(join(tmpdir(), 'tabest-zen-test-'));
const installation = join(temporary, 'browser');
const profile = join(temporary, 'profile');
const resultPath = join(temporary, 'result.json');
cpSync(dirname(installedBinary), installation, { recursive: true });
mkdirSync(profile);
const preferences = join(installation, 'defaults', 'pref');
mkdirSync(preferences, { recursive: true });
writeFileSync(join(preferences, 'tabest-test.js'), [
  'pref("general.config.filename", "config.js");',
  'pref("general.config.obscure_value", 0);',
  'pref("general.config.sandbox_enabled", false);',
].join('\n'));
const addonPath = join(temporary, 'addon');
cpSync(resolve('dist'), addonPath, { recursive: true });
const previewPath = join(temporary, 'preview.html');
writeFileSync(previewPath, '<!doctype html><title>Preview fixture</title><style>body{margin:0;background:#14251e;color:#fff;font:32px sans-serif}header{background:#bf6c45;padding:50px}main{padding:60px;display:flex;gap:30px}section{width:200px;height:250px;background:#a7c989}section+section{background:#e6c278}</style><header>Real tab screenshot</header><main><section>One</section><section>Two</section></main>');
const previewUrl = pathToFileURL(previewPath).href;
const favicon = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="6" fill="#b5cda3"/><path d="M8 8h16v5h-5v11h-6V13H8z" fill="#121518"/></svg>');
writeFileSync(previewPath, readFileSync(previewPath, 'utf8').replace('<title>', `<link rel="icon" href="${favicon}"><title>`));
const fixtures = {
  victim: previewUrl + '?victim', targetB: previewUrl + '?targetB', targetC: previewUrl + '?targetC',
};
writeFileSync(join(addonPath, 'preview-probe.js'), readFileSync(new URL('./zen-preview-probe.js', import.meta.url), 'utf8')
  .replace('__TABEST_PREVIEW_URL__', JSON.stringify(previewUrl)));
const pickerPath = join(addonPath, 'picker.html');
writeFileSync(join(addonPath, 'delete-probe.js'), readFileSync(new URL('./zen-delete-probe.js', import.meta.url), 'utf8')
  .replace('__TABEST_DELETE_FIXTURES__', JSON.stringify(fixtures)));
writeFileSync(join(addonPath, 'filter-probe.js'), readFileSync(new URL('./zen-filter-probe.js', import.meta.url), 'utf8')
  .replace('__TABEST_FILTER_URL__', JSON.stringify(previewUrl)));
writeFileSync(join(addonPath, 'ui-probe.js'), readFileSync(new URL('./zen-ui-probe.js', import.meta.url), 'utf8')
  .replace('__TABEST_UI_URL__', JSON.stringify(previewUrl)));
writeFileSync(pickerPath, readFileSync(pickerPath, 'utf8').replace('</body>', `<script type="module" src="./${ui ? 'ui' : filters ? 'filter' : deletion ? 'delete' : 'preview'}-probe.js"></script></body>`));
const options = { addonPath, resultPath, previewUrl, fixtures, ui };
const harness = readFileSync(new URL(filters || ui ? './zen-filter-harness.js' : deletion ? './zen-delete-harness.js' : './zen-harness.js', import.meta.url), 'utf8')
  .replace('__TABEST_TEST_OPTIONS__', JSON.stringify(options));
writeFileSync(join(installation, 'config.js'), harness);
const child = spawn(join(installation, 'zen'), ['--headless', '--no-remote', '--profile', profile, 'about:blank'], {
  env: { ...process.env, GSETTINGS_BACKEND: 'memory' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
let launchError;
child.on('error', error => { launchError = error; });
child.stdout.on('data', data => { output = (output + data).slice(-16000); });
child.stderr.on('data', data => { output = (output + data).slice(-16000); });
let report;
try {
  const deadline = Date.now() + 55000;
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    if (existsSync(resultPath)) {
      try { report = JSON.parse(readFileSync(resultPath, 'utf8')); } catch { /* Atomic write is in flight. */ }
      if (report?.done) break;
    }
    await wait(100);
  }
  if (!report?.done || !report.passed) throw new Error(report?.error ?? 'Zen integration check timed out');
  console.log(ui ? 'PASS: compact layout, preview toggle, browser favicons, contextual/custom keyboard hints and view persistence.' : filters ? 'PASS: pinned filter keyboard/mouse controls, selection/query preservation, safe marks, persistence, unpinning and responsive layout.' : deletion ? 'PASS: deletion through the UI stays deleted after selection, reopening and creating a fresh picker.' : `PASS: real screenshot and fallbacks fit without scrolling at three sizes; 20 native Ctrl+Shift+Space presses, focus restoration and duplicate cleanup.`);
  console.log(`Report: ${resultPath}`);
} catch (error) {
  console.error(error.message);
  console.error(output);
  console.error(`Artifacts: ${temporary}`);
  process.exitCode = 1;
} finally {
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    const force = setTimeout(() => child.kill('SIGKILL'), 2000);
    force.unref();
    child.once('exit', () => clearTimeout(force));
  }
}
