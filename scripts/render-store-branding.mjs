import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

// Export the existing vector identity without changing the shipped extension.
// Requires librsvg (rsvg-convert) and ImageMagick (magick) on PATH.
const output = resolve('docs/store-assets');
const cache = resolve('node_modules/.cache/tabest-branding');
mkdirSync(output, { recursive: true });
mkdirSync(cache, { recursive: true });
const frames = mkdtempSync(join(cache, 'frames-'));
const icon = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');

async function run(command, args) {
  await new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolveRun() : reject(new Error(`${command} exited with ${code}`)));
  });
}

async function rasterize(svg, size, file) {
  const vector = join(frames, 'current.svg');
  writeFileSync(vector, svg);
  await run('rsvg-convert', ['--width', String(size), '--height', String(size), '-o', file, vector]);
}

for (const size of [32, 48, 96, 128, 512, 1024]) {
  await rasterize(icon, size, join(output, `tabest-icon-${size}.png`));
}

// A quiet three-second loop: a terminal cursor blink and gold activity pulse.
// This is a branding animation, not a recording or a feature demonstration.
const paths = [];
for (let index = 0; index < 30; index++) {
  const cursor = index < 18 ? 1 : 0.18;
  const pulse = (0.72 + 0.28 * Math.cos(index / 30 * Math.PI * 2)).toFixed(3);
  const svg = icon.replace('m23 34 15 14-15 14M47 62h26', 'm23 34 15 14-15 14')
    .replace('</svg>', `<path d="M47 62h26" fill="none" stroke="#a6d8a8" stroke-width="7" stroke-linecap="round" opacity="${cursor}"/></svg>`)
    .replace('<circle ', `<circle opacity="${pulse}" `);
  const file = join(frames, `${String(index).padStart(2, '0')}.png`);
  await rasterize(svg, 512, file);
  paths.push(file);
}
await run('magick', ['-delay', '10', ...paths, '-loop', '0', '-layers', 'Optimize', join(output, 'tabest-icon-animated.gif')]);
console.log(`Branding exports: ${output}`);
console.log(`Intermediate frames: ${frames}`);
