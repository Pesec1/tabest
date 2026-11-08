import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

// Real extension, copied Zen installation, fresh profile, local file fixtures only.
const output = resolve('docs/store-assets/screenshots');
const filenames = ['01-fuzzy-search.png', '02-pinned-and-marks.png'];
for (const name of filenames) {
  if (existsSync(join(output, name))) throw new Error(`Refusing to overwrite ${name}; move existing captures first.`);
}
const cache = resolve('node_modules/.cache/tabest-store-capture');
mkdirSync(cache, { recursive: true });
mkdirSync(output, { recursive: true });
const temporary = mkdtempSync(join(cache, 'session-'));
const installation = join(temporary, 'browser');
const profile = join(temporary, 'profile');
const addonPath = join(temporary, 'addon');
const resultPath = join(temporary, 'result.json');
const pages = [
  { path: '/guides/keyboard', title: 'Keyboard workflow guide', pinned: true, heading: 'Stay in the flow.', label: 'KEYBOARD WORKFLOWS' },
  { path: '/guides/neovim', title: 'Neovim configuration guide', pinned: true, heading: 'Make it your editor.', label: 'EDITOR NOTES' },
  { path: '/guides/tmux', title: 'tmux workspace guide', pinned: true, heading: 'A workspace that fits.', label: 'TERMINAL WORKSPACES' },
  { path: '/notes/project', title: 'Project notes — next release', heading: 'One small step forward.', label: 'PROJECT NOTES' },
  { path: '/reading/typescript', title: 'TypeScript reading list', heading: 'Keep learning.', label: 'READING LIST' },
  { path: '/design/colors', title: 'Color palette and design notes', heading: 'A quieter interface.', label: 'DESIGN NOTES' },
  { path: '/tasks/today', title: 'Today — focus checklist', heading: 'Room for deep work.', label: 'DAILY CHECKLIST' },
];
for (const page of pages) {
  const file = join(temporary, 'pages', page.path + '.html');
  mkdirSync(dirname(file), { recursive: true });
  page.url = pathToFileURL(file).href;
  writeFileSync(file, `<!doctype html><html lang="en"><meta charset="utf-8"><title>${page.title}</title>
<style>body{margin:0;background:#f3f2ec;color:#303b33;font:18px system-ui}header{padding:28px 7%;border-bottom:1px solid #cccec2;font:16px monospace}main{padding:60px 7%;max-width:1100px}small{font:12px monospace;letter-spacing:3px;color:#426441}h1{font-size:56px;font-weight:500;letter-spacing:-2px;margin:25px 0}p{color:#536459;line-height:1.8}.cards{display:flex;gap:24px;margin-top:45px}article{padding:28px;background:#e0e9da;border:1px solid #cccec2;border-radius:12px;flex:1}article+article{background:#eeeee5}h2{font-size:20px}kbd{padding:5px 10px;background:#faf9f4;border:1px solid #cccec2;border-radius:5px}footer{margin-top:45px;font:12px monospace;color:#627064}</style>
<header>workspace / notes</header><main><small>${page.label}</small><h1>${page.heading}</h1><p>A little structure. Fewer distractions. More time for what matters.</p><div class="cards"><article><h2>Find your next step</h2><p>Keep useful references close.<br>Build a workflow that feels natural.</p></article><article><h2>Keep your hands on the keys</h2><p><kbd>j</kbd> <kbd>k</kbd> navigate<br>Small habits, less friction.</p></article></div><footer>LOCAL DEMONSTRATION PAGE · NO PERSONAL DATA</footer></main></html>`);
}
let child;
let log = '';
try {
  const binary = realpathSync(process.env.TABEST_ZEN_BINARY ?? '/opt/zen-browser-bin/zen');
  cpSync(dirname(binary), installation, { recursive: true });
  cpSync(resolve('dist'), addonPath, { recursive: true });
  mkdirSync(profile);
  const preferences = join(installation, 'defaults', 'pref');
  mkdirSync(preferences, { recursive: true });
  writeFileSync(join(preferences, 'tabest-capture.js'), 'pref("general.config.filename", "config.js");\npref("general.config.obscure_value", 0);\npref("general.config.sandbox_enabled", false);\npref("layout.css.devPixelsPerPx", "1.0");\n');
  const options = { addonPath, resultPath, output, pages, filenames };
  writeFileSync(join(installation, 'config.js'), readFileSync(new URL('./store-screenshot-harness.js', import.meta.url), 'utf8').replace('__TABEST_CAPTURE_OPTIONS__', JSON.stringify(options)));
  writeFileSync(join(addonPath, 'store-probe.js'), readFileSync(new URL('./store-screenshot-probe.js', import.meta.url), 'utf8'));
  const picker = join(addonPath, 'picker.html');
  writeFileSync(picker, readFileSync(picker, 'utf8').replace('</body>', '<script type="module" src="./store-probe.js"></script></body>'));
  child = spawn(join(installation, 'zen'), ['--headless', '--no-remote', '--profile', profile, 'about:blank'], { env: { ...process.env, GSETTINGS_BACKEND: 'memory' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let launchError;
  child.once('error', error => { launchError = error; });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { log = (log + chunk).slice(-12000); });
  let report;
  for (let i = 0; i < 550; i++) {
    if (launchError) throw launchError;
    if (existsSync(resultPath)) {
      try { report = JSON.parse(readFileSync(resultPath, 'utf8')); } catch { /* Write pending. */ }
      if (report?.done) break;
    }
    await wait(100);
  }
  if (!report?.passed) throw new Error(report?.error ?? 'Screenshot session timed out');
  console.log(JSON.stringify(report, null, 2));
  console.log(`Session report: ${resultPath}`);
} catch (error) {
  console.error(error.message, log, `\nSession: ${temporary}`);
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
    timer.unref();
    child.once('exit', () => clearTimeout(timer));
  }
}
