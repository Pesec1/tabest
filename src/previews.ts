import type { PreviewResult } from './model.ts';

type Api = Pick<typeof browser, 'tabs' | 'windows' | 'permissions'>;
interface Entry {
  url: string;
  at: number;
  result?: PreviewResult;
  pending?: Promise<PreviewResult>;
}
const unavailable = (reason: Extract<PreviewResult, { state: 'unavailable' }>['reason']): PreviewResult =>
  ({ state: 'unavailable', reason });

export class TabPreviews {
  private entries = new Map<number, Entry>();
  private work: Promise<unknown> = Promise.resolve();
  private api: Api;
  private isPicker: (tab: browser.tabs.Tab) => boolean;
  private clock: () => number;

  constructor(api: Api, isPicker: (tab: browser.tabs.Tab) => boolean, clock = Date.now) {
    this.api = api; this.isPicker = isPicker; this.clock = clock;
  }

  invalidate(id: number): void { this.entries.delete(id); }
  clear(): void { this.entries.clear(); }

  private prune(): void {
    let size = [...this.entries.values()].reduce((sum, entry) =>
      sum + (entry.result?.state === 'ready' ? entry.result.dataUrl.length : 0), 0);
    while (this.entries.size > 24 || size > 4_000_000) {
      const id = this.entries.keys().next().value;
      if (id === undefined) break;
      const result = this.entries.get(id)?.result;
      if (result?.state === 'ready') size -= result.dataUrl.length;
      this.entries.delete(id);
    }
  }

  async get(id: number, requesterWindow: number): Promise<PreviewResult> {
    if (!Number.isInteger(id) || id < 0) return unavailable('missing');
    const [tab, window] = await Promise.all([
      this.api.tabs.get(id).catch(() => undefined),
      this.api.windows.get(requesterWindow).catch(() => undefined),
    ]);
    if (!tab || !window || Boolean(tab.incognito) !== Boolean(window.incognito)) return unavailable('missing');
    if (this.isPicker(tab) || !/^(https?|file|ftp):/i.test(tab.url ?? '')) return unavailable('protected');
    if (tab.discarded) return unavailable('sleeping');
    if (!await this.api.permissions.contains({ origins: ['<all_urls>'] })) return unavailable('permission');

    const cached = this.entries.get(id);
    if (cached && cached.url === tab.url && (cached.pending || this.clock() - cached.at < (cached.result?.state === 'ready' ? 15000 : 3000))) {
      this.entries.delete(id); this.entries.set(id, cached);
      return cached.pending ?? cached.result!;
    }
    const entry: Entry = { url: tab.url!, at: this.clock() };
    this.entries.set(id, entry);
    // Screenshot work has its own queue; it never holds up hotkeys or tab actions.
    const operation = this.work.then(async (): Promise<PreviewResult> => {
      if (this.entries.get(id) !== entry) return unavailable('changed');
      let result: PreviewResult;
      try {
        const current = await this.api.tabs.get(id);
        if (current.url !== entry.url || current.discarded || this.isPicker(current) ||
          Boolean(current.incognito) !== Boolean(window.incognito)) return unavailable('changed');
        const dataUrl = await this.api.tabs.captureTab(id, { format: 'jpeg', quality: 65, scale: 0.5 });
        if (this.entries.get(id) !== entry) return unavailable('changed');
        const after = await this.api.tabs.get(id);
        if (after.url !== entry.url || after.discarded || Boolean(after.incognito) !== Boolean(window.incognito)) return unavailable('changed');
        if (this.entries.get(id) !== entry) return unavailable('changed');
        if (!await this.api.permissions.contains({ origins: ['<all_urls>'] })) return unavailable('permission');
        result = /^data:image\/jpeg;base64,/.test(dataUrl)
          ? { state: 'ready', dataUrl, capturedAt: this.clock() } : unavailable('failed');
      } catch { result = unavailable('failed'); }
      if (this.entries.get(id) === entry) {
        entry.result = result; entry.at = this.clock();
        this.prune();
      }
      return result;
    });
    entry.pending = operation;
    this.work = operation.catch(() => {});
    this.prune();
    try {
      const result = await operation;
      if (this.entries.get(id) === entry && !entry.result) {
        entry.result = result; entry.at = this.clock();
      }
      return result;
    }
    finally { entry.pending = undefined; }
  }
}
