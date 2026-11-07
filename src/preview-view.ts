import type { PreviewResult, TabItem } from './model.ts';

const explanations: Record<Extract<PreviewResult, { state: 'unavailable' }>['reason'], string> = {
  permission: 'Allow access to all websites in the extension permissions to enable page previews.',
  sleeping: 'This tab is sleeping. Open it once to make a preview available.',
  protected: 'The browser does not allow a preview of this page.',
  missing: 'This tab is no longer available.',
  changed: 'The page changed while capturing. Select it again to refresh.',
  failed: 'A preview is not available for this tab right now.',
  demo: 'Load Tabest in Firefox or Zen to preview your real tabs.',
};

export class PreviewView {
  private load: (id: number) => Promise<PreviewResult>;
  private host?: HTMLElement;
  private key?: string;
  private id?: number;
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private pending = false;
  private result?: PreviewResult;
  private at = 0;

  constructor(load: (id: number) => Promise<PreviewResult>) { this.load = load; }

  invalidate(id?: number): void {
    if (id !== undefined && id !== this.id) return;
    this.generation++;
    clearTimeout(this.timer);
    this.key = undefined; this.result = undefined; this.pending = false;
  }

  show(tab: TabItem, host: HTMLElement): void {
    const key = `${tab.id}:${tab.url}:${tab.discarded}`;
    if (this.key !== key) { this.invalidate(); this.key = key; this.id = tab.id; }
    this.host = host;
    if (this.result && Date.now() - this.at < (this.result.state === 'ready' ? 15000 : 3000)) {
      this.paint(this.result); return;
    }
    this.paint();
    if (this.pending) return;
    this.pending = true;
    const generation = this.generation;
    // Navigation through results must not queue a capture for every keystroke.
    this.timer = setTimeout(async () => {
      let result: PreviewResult;
      try { result = await this.load(tab.id); }
      catch { result = { state: 'unavailable', reason: 'failed' }; }
      if (generation !== this.generation) return;
      this.pending = false; this.result = result; this.at = Date.now();
      this.paint(result);
    }, 140);
  }

  private paint(result?: PreviewResult): void {
    if (!this.host) return;
    const host = this.host;
    host.replaceChildren();
    host.dataset.state = result?.state ?? 'loading';
    if (result?.state === 'ready') {
      const image = document.createElement('img');
      image.alt = 'Snapshot of the selected tab';
      image.className = 'page-preview-image';
      image.decoding = 'async';
      image.src = result.dataUrl;
      image.addEventListener('error', () => {
        if (this.host === host) this.paint({ state: 'unavailable', reason: 'failed' });
      }, { once: true });
      host.append(image);
      const caption = document.createElement('figcaption');
      caption.textContent = 'PAGE SNAPSHOT';
      caption.className = 'page-preview-caption';
      host.append(caption);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'page-preview-placeholder';
      const icon = document.createElement('span');
      icon.className = 'page-preview-symbol'; icon.textContent = result ? '▧' : '◌'; icon.setAttribute('aria-hidden', 'true');
      const text = document.createElement('p');
      text.textContent = result ? explanations[result.reason] : 'Capturing preview…';
      placeholder.append(icon, text);
      host.append(placeholder);
    }
  }
}
