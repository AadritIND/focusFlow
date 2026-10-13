import { DEFAULT_PREFS, type Prefs, type RoomDoc, type Session } from './types';

const DEVICE_KEY = 'focusflow:device:v2';
const PREFS_KEY = 'focusflow:prefs:v2';
const ROOMS_KEY = 'focusflow:rooms:v2';
const cacheKey = (code: string) => `focusflow:cache:v2:${code}`;
const deletedKey = (code: string) => `focusflow:deleted:v2:${code}`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota — the app still works, it just forgets */
  }
}

/* ------------------------------------------------------------------ */
/* Device identity                                                     */
/* ------------------------------------------------------------------ */

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `d-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function guessDeviceName(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const platform = /iPhone/i.test(ua)
    ? 'iPhone'
    : /iPad/i.test(ua)
      ? 'iPad'
      : /Android/i.test(ua)
        ? 'Android'
        : /Macintosh|Mac OS X/i.test(ua)
          ? 'Mac'
          : /Windows/i.test(ua)
            ? 'PC'
            : /Linux/i.test(ua)
              ? 'Linux'
              : 'Browser';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser';
  return browser === 'Browser' ? platform : `${browser} · ${platform}`;
}

export interface Device {
  id: string;
  name: string;
}

export function loadDevice(): Device {
  const stored = read<Device | null>(DEVICE_KEY, null);
  if (stored?.id) {
    if (!stored.name) {
      const fixed = { ...stored, name: guessDeviceName() };
      write(DEVICE_KEY, fixed);
      return fixed;
    }
    return stored;
  }
  const device = { id: randomId(), name: guessDeviceName() };
  write(DEVICE_KEY, device);
  return device;
}

export function saveDeviceName(name: string): Device {
  const device = { ...loadDevice(), name: name.trim().slice(0, 40) || guessDeviceName() };
  write(DEVICE_KEY, device);
  return device;
}

/* ------------------------------------------------------------------ */
/* Local preferences                                                   */
/* ------------------------------------------------------------------ */

export function loadPrefs(): Prefs {
  return { ...DEFAULT_PREFS, ...read<Partial<Prefs>>(PREFS_KEY, {}) };
}

export function savePrefs(prefs: Prefs): void {
  write(PREFS_KEY, prefs);
}

/* ------------------------------------------------------------------ */
/* Room membership — this is what makes a device "stay" in a room      */
/* ------------------------------------------------------------------ */

export interface Membership {
  code: string;
  token: string;
  name: string;
  deviceName: string;
  joinedAt: number;
  lastVisited: number;
}

type RoomMap = Record<string, Membership>;

export function rememberedRooms(): Membership[] {
  const map = read<RoomMap>(ROOMS_KEY, {});
  return Object.values(map).sort((a, b) => b.lastVisited - a.lastVisited);
}

export function membership(code: string): Membership | null {
  const map = read<RoomMap>(ROOMS_KEY, {});
  return map[code.toUpperCase()] ?? null;
}

export function rememberRoom(next: Omit<Membership, 'lastVisited'> & { lastVisited?: number }): Membership {
  const code = next.code.toUpperCase();
  const map = read<RoomMap>(ROOMS_KEY, {});
  const entry: Membership = { ...next, code, lastVisited: next.lastVisited ?? Date.now() };
  map[code] = entry;
  write(ROOMS_KEY, map);
  return entry;
}

export function touchRoom(code: string): void {
  const current = membership(code);
  if (current) rememberRoom({ ...current, lastVisited: Date.now() });
}

export function forgetRoom(code: string): void {
  const key = code.toUpperCase();
  const map = read<RoomMap>(ROOMS_KEY, {});
  delete map[key];
  write(ROOMS_KEY, map);
  try {
    localStorage.removeItem(cacheKey(key));
  } catch {
    /* ignore */
  }
}

export const lastRoomCode = (): string | null => rememberedRooms()[0]?.code ?? null;

/* ------------------------------------------------------------------ */
/* Offline snapshot of a room                                          */
/* ------------------------------------------------------------------ */

export interface RoomCache {
  revision: number;
  doc: RoomDoc;
  sessions: Session[];
  sessCursor: number;
  tombCursor: number;
  name: string;
  tz: string;
  savedAt: number;
}

export function loadRoomCache(code: string): RoomCache | null {
  return read<RoomCache | null>(cacheKey(code.toUpperCase()), null);
}

export function saveRoomCache(code: string, cache: RoomCache): void {
  write(cacheKey(code.toUpperCase()), cache);
}

/* ------------------------------------------------------------------ */
/* Sessions deleted elsewhere must not be re-uploaded                  */
/* ------------------------------------------------------------------ */

export function deletedIds(code: string): Set<string> {
  return new Set(read<string[]>(deletedKey(code.toUpperCase()), []));
}

export function rememberDeleted(code: string, ids: string[]): void {
  if (!ids.length) return;
  const current = deletedIds(code);
  ids.forEach((id) => current.add(id));
  write(deletedKey(code.toUpperCase()), [...current].slice(-2000));
}
