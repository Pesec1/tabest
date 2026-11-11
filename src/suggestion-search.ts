import type { HistorySuggestion } from './model.ts';

// Tab search renders immediately. History uses the browser's index after a
// short typing pause, and late replies cannot replace a newer query.
export class SuggestionSearch {
  items: HistorySuggestion[] = [];
  state: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  private query = '';
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private load: (query: string) => Promise<HistorySuggestion[]>;
  private changed: () => void;
  private delay: number;
  constructor(load: (query: string) => Promise<HistorySuggestion[]>, changed: () => void, delay = 40) {
    this.load = load; this.changed = changed; this.delay = delay;
  }
  reset(): void {
    clearTimeout(this.timer); this.generation++; this.query = ''; this.items = []; this.state = 'idle';
  }
  update(query: string, enabled: boolean): void {
    const next = enabled && query.trim() && query.length <= 256 ? query.trim() : '';
    if (next === this.query) return;
    this.reset(); this.query = next;
    if (!next) return;
    this.state = 'loading';
    const generation = this.generation;
    this.timer = setTimeout(async () => {
      try {
        const items = await this.load(next);
        if (generation !== this.generation) return;
        this.items = items; this.state = 'ready';
      } catch {
        if (generation !== this.generation) return;
        this.items = []; this.state = 'error';
      }
      this.changed();
    }, this.delay);
  }
}
