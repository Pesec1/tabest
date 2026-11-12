import { queryAction } from './query-action.ts';

type Api = Pick<typeof browser, 'tabs' | 'windows' | 'search'>;

export class QueryLauncher {
  private api: Api;
  private opened?: (tab: browser.tabs.Tab) => Promise<void>;
  constructor(api: Api, opened?: (tab: browser.tabs.Tab) => Promise<void>) { this.api = api; this.opened = opened; }

  async launch(query: string, caller: browser.tabs.Tab): Promise<void> {
    if (typeof query !== 'string') throw new Error('Enter an address or search.');
    const action = queryAction(query);
    if (!action) return;
    if (action.kind === 'invalid') throw new Error(action.reason);
    const window = await this.api.windows.get(caller.windowId);
    if (Boolean(window.incognito) !== Boolean(caller.incognito)) throw new Error('The window changed. Please try again.');
    if (action.kind === 'address') {
      const tab = await this.api.tabs.create({ windowId: caller.windowId, url: action.url, active: true, openerTabId: caller.id });
      await this.opened?.(tab);
      return;
    }
    if (!this.api.search?.search) throw new Error('Browser search is unavailable. Reload the extension with its search permission.');
    const target = await this.api.tabs.create({ windowId: caller.windowId, url: 'about:blank', active: false, openerTabId: caller.id });
    if (target.id === undefined || target.id < 0) throw new Error('Could not create a search tab.');
    try {
      await this.opened?.(target);
      await this.api.search.search({ query: action.query, tabId: target.id });
      await this.api.tabs.update(target.id, { active: true });
    } catch (error) {
      const current = await this.api.tabs.get(target.id).catch(() => undefined);
      if (current && !current.active && current.windowId === caller.windowId && current.url === 'about:blank') {
        await this.api.tabs.remove(target.id).catch(() => {});
      }
      throw error;
    }
  }
}
