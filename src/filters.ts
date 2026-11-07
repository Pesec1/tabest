import type { Settings, TabFilter, TabItem } from './model.ts';

export function readTabFilter(value: unknown): TabFilter {
  return value === 'pinned' ? 'pinned' : 'all';
}

export function filterTabs(tabs: TabItem[], windowId: number, scope: Settings['scope'], filter: TabFilter): TabItem[] {
  return tabs.filter(tab => (scope === 'all' || tab.windowId === windowId) && (filter === 'all' || tab.pinned));
}
