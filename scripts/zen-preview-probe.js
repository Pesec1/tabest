// Injected into the temporary test addon only, never shipped in dist.
const fixtureUrl = __TABEST_PREVIEW_URL__;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (predicate, text) => {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await wait(50); }
  throw new Error(text);
};

function checkLayout(state) {
  const panel = document.querySelector('.preview-panel');
  const title = document.querySelector('.preview-title');
  const url = document.querySelector('.preview-url');
  title.textContent = 'A long tab title with a lot of information '.repeat(30);
  url.textContent = 'https://example.com/' + 'a-very-long-path/'.repeat(60);
  const details = document.querySelector('.details');
  if (details.children.length < 4) {
    const field = document.createElement('div');
    field.className = 'preview-detail';
    field.innerHTML = '<dt>CONTAINER</dt><dd>firefox-container-with-a-very-long-name</dd>';
    details.append(field);
  }
  const stateField = Array.from(details.children).find(field => field.querySelector('dt').textContent === 'STATE');
  stateField.querySelector('dd').textContent = 'Pinned · Playing audio · Opened from here';
  for (const [width, height] of [[250, 410], [320, 480], [480, 720]]) {
    panel.style.width = width + 'px'; panel.style.height = height + 'px';
    const bounds = panel.getBoundingClientRect();
    for (const element of [panel, document.getElementById('preview')]) {
      if (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1) {
        throw new Error(`${state}: preview overflows at ${width}×${height}`);
      }
      element.scrollTop = 100;
      if (element.scrollTop !== 0) throw new Error(`${state}: preview can scroll`);
    }
    for (const selector of ['.preview-summary', '.page-preview', '.details', '.preview-actions', '.preview-actions .primary', '.preview-actions .secondary']) {
      const rect = panel.querySelector(selector).getBoundingClientRect();
      if (rect.height <= 0 || rect.top < bounds.top || rect.bottom > bounds.bottom + 1 || rect.right > bounds.right + 1) {
        throw new Error(`${state}: ${selector} is clipped at ${width}×${height}`);
      }
    }
    const placeholder = panel.querySelector('.page-preview-placeholder');
    if (placeholder && placeholder.scrollHeight > placeholder.clientHeight + 1) {
      throw new Error(`${state}: placeholder text is clipped at ${width}×${height}`);
    }
  }
  panel.style.removeProperty('width'); panel.style.removeProperty('height');
}
try {
  await until(() => document.querySelectorAll('.result').length > 0, 'Results did not load');
  const query = document.getElementById('query');
  query.value = fixtureUrl;
  query.dispatchEvent(new Event('input', { bubbles: true }));
  await until(() => {
    const image = document.querySelector('.page-preview-image');
    return image?.complete && image.naturalWidth > 0;
  }, 'Real screenshot did not load: ' + document.getElementById('page-preview')?.textContent);
  const image = document.querySelector('.page-preview-image');
  const canvas = document.createElement('canvas');
  canvas.width = 32; canvas.height = 32;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, 32, 32);
  const pixels = context.getImageData(0, 0, 32, 32).data;
  const colors = new Set();
  for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
  if (colors.size < 5) throw new Error('Screenshot is blank');
  checkLayout('screenshot');
  if (!document.querySelector('.details') || !document.querySelector('.preview-title')) throw new Error('Tab details disappeared');
  const target = (await browser.tabs.query({})).find(tab => tab.url === fixtureUrl);
  if (target?.active) throw new Error('Preview activated its target tab');
  // Moving away from the captured page must clear its image before showing
  // the protected tab's placeholder.
  query.value = 'about:blank';
  query.dispatchEvent(new Event('input', { bubbles: true }));
  await until(() => document.querySelector('#page-preview[data-state="unavailable"]'), 'Protected page fallback did not appear');
  if (document.querySelector('.page-preview-image')) throw new Error('Previous screenshot remained on protected page');
  checkLayout('protected page');
  document.querySelector('.page-preview-placeholder p').textContent = 'Allow access to all websites in the extension permissions to enable page previews.';
  checkLayout('permission placeholder');
  document.title = 'Tabest · Tabs [preview-ok]';
} catch (error) {
  document.title = 'Tabest · Tabs [preview-failed: ' + error.message + ']';
}
