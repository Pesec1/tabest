import type { HistorySuggestion } from './model.ts';
import { readSettings } from './keys.ts';
import { fuzzyMatch } from './search.ts';

export function historyUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return;
    url.hash = '';
    return url.href;
  } catch { return; }
}

export function rankHistory(items: browser.history.HistoryItem[], query: string, openUrls: string[], now = Date.now()): HistorySuggestion[] {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const excluded = new Set(openUrls.map(historyUrl));
  const seen = new Set<string>();
  const matches: (HistorySuggestion & { score: number; lastVisit: number })[] = [];
  for (const item of items) {
    const canonical = item.url && historyUrl(item.url);
    if (!canonical || excluded.has(canonical)) continue;
    const title = item.title || item.url!;
    let score = 0;
    const titlePositions = new Set<number>();
    const urlPositions = new Set<number>();
    let matched = true;
    for (const token of tokens) {
      const a = fuzzyMatch(title, token);
      const b = fuzzyMatch(item.url!, token);
      if (!a && !b) { matched = false; break; }
      score += Math.max(a ? a.score * 1.2 : -Infinity, b?.score ?? -Infinity);
      a?.positions.forEach(i => titlePositions.add(i));
      b?.positions.forEach(i => urlPositions.add(i));
    }
    if (!matched) continue;
    const lastVisit = item.lastVisitTime ?? 0;
    const days = Math.max(0, now - lastVisit) / 86_400_000;
    score += Math.log2(1 + Math.max(0, item.visitCount ?? 0)) * 10 +
      Math.log2(1 + Math.max(0, item.typedCount ?? 0)) * 5 + 20 / (1 + days);
    matches.push({ title, url: item.url!, titlePositions: [...titlePositions], urlPositions: [...urlPositions], score, lastVisit });
  }
  return matches.sort((a, b) => b.score - a.score || b.lastVisit - a.lastVisit || a.url.localeCompare(b.url))
    .filter(item => {
      const canonical = historyUrl(item.url)!;
      if (seen.has(canonical)) return false;
      seen.add(canonical); return true;
    }).slice(0, 5).map(({ title, url, titlePositions, urlPositions }) => ({ title, url, titlePositions, urlPositions }));
}

type Api = Pick<typeof browser, 'history' | 'permissions' | 'storage' | 'tabs'>;

export class HistorySuggestions {
  private api: Api;
  private generation = 0;
  private sequence = 0;
  private queries = new Map<number, number>();
  private offered = new Map<number, Set<string>>();
  constructor(api: Api) { this.api = api; }

  clear(): void { this.generation++; this.offered.clear(); this.queries.clear(); }
  forget(id: number): void { this.offered.delete(id); this.queries.delete(id); }

  private async allowed(caller: browser.tabs.Tab): Promise<boolean> {
    if (caller.incognito) return false;
    const settings = readSettings((await this.api.storage.local.get('settings')).settings);
    return settings.historySuggestions && await this.api.permissions.contains({ permissions: ['history'] });
  }

  async search(query: string, caller: browser.tabs.Tab): Promise<HistorySuggestion[]> {
    if (typeof query !== 'string' || !query.trim() || query.length > 256 || !await this.allowed(caller)) return [];
    const generation = this.generation;
    const sequence = ++this.sequence;
    if (caller.id !== undefined) this.queries.set(caller.id, sequence);
    const items = await this.api.history.search({ text: query.trim(), startTime: 0, maxResults: 100 });
    const tabs = await this.api.tabs.query({});
    if (!await this.allowed(caller) || generation !== this.generation ||
      (caller.id !== undefined && this.queries.get(caller.id) !== sequence)) return [];
    const suggestions = rankHistory(items, query, tabs.filter(tab => !tab.incognito).map(tab => tab.url ?? ''));
    if (caller.id !== undefined) {
      this.offered.delete(caller.id);
      this.offered.set(caller.id, new Set(suggestions.map(item => item.url)));
      if (this.offered.size > 20) this.offered.delete(this.offered.keys().next().value!);
    }
    return suggestions;
  }

  async resolve(url: string, caller: browser.tabs.Tab): Promise<string> {
    const offered = caller.id === undefined ? undefined : this.offered.get(caller.id);
    if (!offered || !offered.has(url) || !historyUrl(url) ||
      !await this.allowed(caller) || this.offered.get(caller.id!) !== offered) {
      throw new Error('This history suggestion is no longer available. Search again.');
    }
    return url;
  }
}
