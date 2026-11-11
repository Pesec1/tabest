import type { Action, Mode, Settings } from './model.ts';

export interface ActionHint { key: string; label: string }

export function actionHints(settings: Settings, mode: Mode, marked: number, selected: boolean, pinned: boolean, activeMarked: boolean): ActionHint[] {
  const hints: ActionHint[] = [];
  const add = (action: Action, label: string) => {
    const key = Object.entries(settings.keymap[mode]).find(([, value]) => value === action)?.[0];
    if (key) hints.push({ key, label });
  };
  if (selected) {
    add('accept', 'Switch');
    add('markNext', activeMarked ? 'Unmark' : 'Mark next');
  }
  if (selected || marked) {
    add('close', marked ? `Close ${marked} marked` : 'Close tab');
    if (selected) add('pin', pinned ? 'Unpin tab' : 'Pin tab');
    if (mode === 'insert') add('normal', marked ? 'Manage marked tabs' : 'More actions');
  }
  if (!selected && !marked) add('allTabs', 'All tabs');
  add('cancel', 'Return');
  return hints;
}
