/** Shared shapes between the app and the FocusFlow API. */

export type Mode = 'focus' | 'short' | 'long';

export interface Task {
  id: string;
  text: string;
  est: number;
  done: boolean;
  createdBy: string;
  createdAt: number;
}

export interface TimerSettings {
  work: number;
  short: number;
  long: number;
  interval: number;
  goal: number;
}

/** The single shared document per room — the timer everyone sees. */
export interface RoomDoc {
  v: number;
  mode: Mode;
  running: boolean;
  startedAt: number;
  endsAt: number;
  remainingMs: number;
  cycle: number;
  intention: string;
  activeTaskId: string | null;
  tasks: Task[];
  timer: TimerSettings;
  updatedAt: number;
  updatedBy: string | null;
}

export interface Session {
  id: string;
  day: string;
  kind: Mode;
  startedAt: number;
  endedAt: number;
  minutes: number;
  taskId: string | null;
  taskLabel: string | null;
  deviceId?: string | null;
  memberName?: string | null;
  seq?: number;
  /** Set while a session is only in this browser, waiting for the server. */
  pending?: boolean;
}

export interface MemberStatus {
  mode?: Mode;
  running?: boolean;
  endsAt?: number;
  remainingMs?: number;
  task?: string;
}

export interface Member {
  deviceId: string;
  name: string;
  joinedAt: number;
  lastSeen: number;
  status: MemberStatus | null;
}

export interface RoomMeta {
  code: string;
  name: string;
  tz: string;
  createdAt: number;
}

export interface RoomTotals {
  sessions: number;
  minutes: number;
}

export interface GlobalStats {
  rooms: number;
  members: number;
  sessions: number;
  focusSessions: number;
  minutes: number;
  sessions24h: number;
  minutes24h: number;
  serverTime: number;
}

export interface Bootstrap {
  room: RoomMeta;
  token: string;
  revision: number;
  doc: RoomDoc;
  sessions: Session[];
  sessCursor: number;
  tombCursor: number;
  members: Member[];
  serverTime: number;
}

export interface SyncResult {
  serverTime: number;
  revision: number;
  doc: RoomDoc | null;
  updatedAt: number;
  updatedBy: string | null;
  sessions: Session[];
  sessCursor: number;
  tombstones: string[];
  tombCursor: number;
  hasMore: boolean;
  members: Member[];
  room: RoomMeta;
}

export type Chime = 'off' | 'bell' | 'triad' | 'glass';
export type Ambient = 'off' | 'brown' | 'rain' | 'cafe';

/** Preferences that stay on this device. */
export interface Prefs {
  theme: 'light' | 'dark' | 'system';
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  notify: boolean;
  chime: Chime;
  volume: number;
  ambient: Ambient;
  ambientVolume: number;
  hour24: boolean;
  headerSeconds: boolean;
  keepAwake: boolean;
  reduceMotion: boolean;
}

export const DEFAULT_TIMER: TimerSettings = { work: 25, short: 5, long: 15, interval: 4, goal: 8 };

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  autoStartBreaks: true,
  autoStartFocus: false,
  notify: false,
  chime: 'bell',
  volume: 60,
  ambient: 'off',
  ambientVolume: 35,
  hour24: true,
  headerSeconds: false,
  keepAwake: true,
  reduceMotion: false,
};

export const MODE_KEY: Record<Mode, keyof TimerSettings> = { focus: 'work', short: 'short', long: 'long' };

export const modeMinutes = (timer: TimerSettings, mode: Mode) => timer[MODE_KEY[mode]];

export const MODE_LABEL: Record<Mode, string> = {
  focus: 'Focus',
  short: 'Short break',
  long: 'Long break',
};

export const MODE_HINT: Record<Mode, string> = {
  focus: 'Pick one thing and stay with it.',
  short: 'Stand up, look away, breathe.',
  long: 'Step away properly. You have earned it.',
};
