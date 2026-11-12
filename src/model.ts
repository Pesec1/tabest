export interface TabItem {
  id: number;
  windowId: number;
  title: string;
  url: string;
  favIconUrl?: string;
  lastUsed: number;
  pinned: boolean;
  audible: boolean;
  muted: boolean;
  discarded: boolean;
  origin: boolean;
  container?: string;
  sessionIds?: string[];
}

export interface WorkSession { id: string; name: string }
export interface WorkSessionState {
  // User-created sessions only; 'all' is a view, never a tab membership.
  sessions: WorkSession[];
  activeSessionId: string;
  autoAssign: boolean;
}
export interface Snapshot {
  tabs: TabItem[];
  windowId: number;
  private: boolean;
  workSessions?: WorkSessionState;
}

export type Mode = 'insert' | 'normal';
export type TabFilter = 'all' | 'pinned';
export type Action = 'next' | 'previous' | 'accept' | 'cancel' | 'normal' | 'insert' |
  'first' | 'last' | 'markNext' | 'markPrevious' | 'close' | 'help' | 'scope' | 'pin' | 'allTabs' | 'pinnedTabs' | 'launchQuery' | 'switchSession' | 'moveSession';
export type Keymap = Record<Mode, Partial<Record<string, Action>>>;

export interface Settings {
  keymapVersion: 4;
  scope: 'all' | 'window';
  theme: 'dark' | 'light' | 'system';
  layout: 'compact' | 'comfortable';
  showPreview: boolean;
  historySuggestions: boolean;
  keymap: Keymap;
}

export type Request =
  | { type: 'snapshot' }
  | { type: 'preview'; id: number }
  | { type: 'select'; id: number }
  | { type: 'return' }
  | { type: 'close'; ids: number[] }
  | { type: 'pin'; id: number }
  | { type: 'history'; query: string }
  | { type: 'launch-query'; query: string }
  | { type: 'session-create'; name: string; ids: number[] }
  | { type: 'session-switch'; sessionId: string }
  | { type: 'session-move'; sessionId: string; ids: number[] }
  | { type: 'session-rename'; sessionId: string; name: string }
  | { type: 'session-delete'; sessionId: string }
  | { type: 'session-auto'; enabled: boolean }
  | { type: 'session-new-tab' }
  | { type: 'open-history'; url: string };

export interface HistorySuggestion {
  title: string;
  url: string;
  titlePositions: number[];
  urlPositions: number[];
}

export type PreviewResult =
  | { state: 'ready'; dataUrl: string; capturedAt: number }
  | { state: 'unavailable'; reason: 'permission' | 'sleeping' | 'protected' | 'missing' | 'changed' | 'failed' | 'demo' };

export type Reply = { ok: true; snapshot?: Snapshot; preview?: PreviewResult; suggestions?: HistorySuggestion[] } | { ok: false; error: string };
