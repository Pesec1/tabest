import type { TabItem } from './model.ts';

export interface Match { score: number; positions: number[] }
export interface SearchResult {
  tab: TabItem;
  score: number;
  titlePositions: number[];
  urlPositions: number[];
}

// Subsequence matching with a dynamic program: word starts and consecutive
// characters beat scattered matches, even when an earlier match is available.
export function fuzzyMatch(text: string, query: string): Match | null {
  if (!query) return { score: 0, positions: [] };
  const source = text.toLowerCase();
  const needle = query.toLowerCase();
  let previous = new Map<number, Match>();
  for (let q = 0; q < needle.length; q++) {
    const current = new Map<number, Match>();
    let bestPrefix: Match | undefined;
    let bestAdjusted = -Infinity;
    for (let i = 0; i < source.length; i++) {
      const before = previous.get(i - 1);
      if (before && before.score + (i - 1) * 0.25 > bestAdjusted) {
        bestPrefix = before;
        bestAdjusted = before.score + (i - 1) * 0.25;
      }
      if (source[i] !== needle[q]) continue;
      const boundary = i === 0 || /[\s/._\-:?=&()[\]#]/.test(text[i - 1]);
      const bonus = 10 + (boundary ? 12 : 0);
      if (q === 0) {
        current.set(i, { score: bonus - i * 0.15, positions: [i] });
      } else if (bestPrefix) {
        let match = {
          score: bestAdjusted - (i - 1) * 0.25 + bonus,
          positions: [...bestPrefix.positions, i],
        };
        if (before && before.score + bonus + 14 > match.score) {
          match = { score: before.score + bonus + 14, positions: [...before.positions, i] };
        }
        current.set(i, match);
      }
    }
    if (!current.size) return null;
    previous = current;
  }
  return [...previous.values()].reduce((a, b) => a.score >= b.score ? a : b);
}

export function searchTabs(tabs: TabItem[], query: string): SearchResult[] {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  const results: SearchResult[] = [];
  for (const tab of tabs) {
    let score = 0;
    const titlePositions = new Set<number>();
    const urlPositions = new Set<number>();
    let matched = true;
    for (const token of tokens) {
      const title = fuzzyMatch(tab.title, token);
      const url = fuzzyMatch(tab.url, token);
      if (!title && !url) { matched = false; break; }
      score += Math.max(title ? title.score * 1.2 : -Infinity, url?.score ?? -Infinity);
      title?.positions.forEach(i => titlePositions.add(i));
      url?.positions.forEach(i => urlPositions.add(i));
    }
    if (matched) results.push({ tab, score, titlePositions: [...titlePositions], urlPositions: [...urlPositions] });
  }
  return results.sort((a, b) => {
    if (tokens.length) return b.score - a.score || b.tab.lastUsed - a.tab.lastUsed || a.tab.id - b.tab.id;
    return Number(a.tab.origin) - Number(b.tab.origin) || b.tab.lastUsed - a.tab.lastUsed || a.tab.id - b.tab.id;
  });
}
