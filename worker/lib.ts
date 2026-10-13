/**
 * Shared helpers for the FocusFlow Worker API.
 */

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  APP_NAME?: string;
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });
}

export function fail(status: number, error: string, detail?: string): Response {
  return json(detail ? { error, detail } : { error }, status);
}

export const LIMITS = {
  docBytes: 96 * 1024,
  sessionBatch: 300,
  sessionFetch: 500,
  sessionDelete: 1000,
  membersReturned: 60,
  staleMemberMs: 30 * 24 * 60 * 60 * 1000,
  tombstoneMs: 90 * 24 * 60 * 60 * 1000,
};

/* ------------------------------------------------------------------ */
/* Room codes                                                          */
/* ------------------------------------------------------------------ */

const ADJECTIVES = [
  'AMBER', 'ARCTIC', 'BASALT', 'CEDAR', 'CITRINE', 'CLAY', 'COBALT', 'COPPER',
  'CORAL', 'CRIMSON', 'DAWN', 'DUSK', 'EMBER', 'FERN', 'FLINT', 'FROST',
  'GARNET', 'GLACIER', 'GRANITE', 'HAZEL', 'INDIGO', 'IVORY', 'JADE', 'JUNIPER',
  'LAGOON', 'LANTERN', 'LINEN', 'LOTUS', 'MAPLE', 'MARBLE', 'MEADOW', 'MICA',
  'MIDNIGHT', 'MOSS', 'NORDIC', 'OCHRE', 'OLIVE', 'OPAL', 'PEBBLE', 'PINE',
  'PLUM', 'QUARTZ', 'RIVER', 'RUST', 'SAFFRON', 'SAGE', 'SAND', 'SLATE',
];

const NOUNS = [
  'ACORN', 'ALBATROSS', 'ASPEN', 'BADGER', 'BEACON', 'BISON', 'BLOOM', 'CANYON',
  'CARAVAN', 'COMET', 'COMPASS', 'CRANE', 'CROW', 'DUNE', 'EGRET', 'FALCON',
  'FERRY', 'FJORD', 'FOX', 'GEYSER', 'GROVE', 'GULL', 'HARBOR', 'HERON',
  'IBIS', 'ISLAND', 'KESTREL', 'LANTERN', 'LARK', 'LEDGE', 'LYNX', 'MEADOW',
  'METEOR', 'MOTH', 'NEBULA', 'NEST', 'OTTER', 'OWL', 'PEAK', 'PELICAN',
  'QUARRY', 'RAVEN', 'REED', 'RIDGE', 'SANDPIPER', 'SEAL', 'STORK', 'SUMMIT',
  'THISTLE', 'TIDE', 'TRUFFLE', 'VALLEY', 'WREN', 'YARROW',
];

const rand = (n: number) => Math.floor(Math.random() * n);

/** e.g. AMBER-FOX-73 — short enough to type, memorable enough to read aloud. */
export function makeCode(): string {
  const a = ADJECTIVES[rand(ADJECTIVES.length)];
  const n = NOUNS[rand(NOUNS.length)];
  const d = String(rand(90) + 10);
  return `${a}-${n}-${d}`;
}

export const normalizeCode = (raw: string) =>
  decodeURIComponent(raw).trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40);

export const looksLikeCode = (code: string) => /^[A-Z0-9-]{3,40}$/.test(code);

/* ------------------------------------------------------------------ */
/* Input coercion                                                      */
/* ------------------------------------------------------------------ */

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > 512 * 1024) return null;
  try {
    const body = await req.text();
    if (!body || body.length > 512 * 1024) return null;
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function str(value: unknown, max: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return trimmed.slice(0, max) || fallback;
}

export function int(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r < min || r > max ? null : r;
}

export const isDayKey = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

export interface RoomDoc {
  v: number;
  mode: 'focus' | 'short' | 'long';
  running: boolean;
  startedAt: number;
  endsAt: number;
  remainingMs: number;
  cycle: number;
  intention: string;
  activeTaskId: string | null;
  tasks: unknown[];
  timer: { work: number; short: number; long: number; interval: number; goal: number };
  updatedAt: number;
  updatedBy: string | null;
}

export function defaultDoc(now: number): RoomDoc {
  return {
    v: 1,
    mode: 'focus',
    running: false,
    startedAt: 0,
    endsAt: 0,
    remainingMs: 25 * 60000,
    cycle: 0,
    intention: '',
    activeTaskId: null,
    tasks: [],
    timer: { work: 25, short: 5, long: 15, interval: 4, goal: 8 },
    updatedAt: now,
    updatedBy: null,
  };
}

/** Trim the shared doc down to the shape we are willing to store. */
export function sanitizeDoc(input: unknown, now: number): RoomDoc | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const base = defaultDoc(now);
  const rawTimer = (raw.timer && typeof raw.timer === 'object' ? raw.timer : {}) as Record<string, unknown>;

  const mode = raw.mode === 'short' || raw.mode === 'long' || raw.mode === 'focus' ? raw.mode : 'focus';
  const tasks: unknown[] = [];
  if (Array.isArray(raw.tasks)) {
    for (const t of raw.tasks.slice(0, 200)) {
      if (!t || typeof t !== 'object') continue;
      const task = t as Record<string, unknown>;
      const id = str(task.id, 40);
      const text = str(task.text, 120);
      if (!id || !text) continue;
      tasks.push({
        id,
        text,
        est: int(task.est, 1, 99) ?? 1,
        done: task.done === true,
        createdBy: str(task.createdBy, 40, ''),
        createdAt: int(task.createdAt, 0, 4e12) ?? now,
      });
    }
  }

  return {
    v: 1,
    mode,
    running: raw.running === true,
    startedAt: int(raw.startedAt, 0, 4e12) ?? 0,
    endsAt: int(raw.endsAt, 0, 4e12) ?? 0,
    remainingMs: int(raw.remainingMs, 0, 24 * 3600 * 1000) ?? base.remainingMs,
    cycle: int(raw.cycle, 0, 100000) ?? 0,
    intention: str(raw.intention, 160, ''),
    activeTaskId: raw.activeTaskId ? str(raw.activeTaskId, 40) : null,
    tasks,
    timer: {
      work: int(rawTimer.work, 1, 180) ?? base.timer.work,
      short: int(rawTimer.short, 1, 60) ?? base.timer.short,
      long: int(rawTimer.long, 1, 120) ?? base.timer.long,
      interval: int(rawTimer.interval, 1, 24) ?? base.timer.interval,
      goal: int(rawTimer.goal, 1, 99) ?? base.timer.goal,
    },
    updatedAt: int(raw.updatedAt, 0, 4e12) ?? now,
    updatedBy: raw.updatedBy ? str(raw.updatedBy, 40) : null,
  };
}

export interface SessionRow {
  id: string;
  day: string;
  kind: 'focus' | 'short' | 'long';
  startedAt: number;
  endedAt: number;
  minutes: number;
  taskId: string | null;
  taskLabel: string | null;
}

export function sanitizeSession(input: unknown, now: number): SessionRow | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const id = str(raw.id, 80);
  if (!id || !isDayKey(raw.day)) return null;
  const kind = raw.kind === 'short' || raw.kind === 'long' ? raw.kind : 'focus';
  const minutes = int(raw.minutes, 1, 1440);
  if (minutes === null) return null;
  const startedAt = int(raw.startedAt, 0, 4e12) ?? now;
  const endedAt = int(raw.endedAt, 0, 4e12) ?? startedAt + minutes * 60000;
  return {
    id,
    day: raw.day,
    kind,
    startedAt,
    endedAt,
    minutes,
    taskId: raw.taskId ? str(raw.taskId, 40) : null,
    taskLabel: raw.taskLabel ? str(raw.taskLabel, 120) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Membership                                                          */
/* ------------------------------------------------------------------ */

export interface MemberRow {
  code: string;
  device_id: string;
  name: string;
  token: string;
  joined_at: number;
  last_seen: number;
  status: string | null;
}

export async function findMember(
  env: Env,
  code: string,
  deviceId: string,
  token: string,
): Promise<MemberRow | null> {
  if (!deviceId || !token) return null;
  const row = await env.DB.prepare(
    'SELECT * FROM members WHERE code = ? AND device_id = ? AND token = ?',
  )
    .bind(code, deviceId, token)
    .first<MemberRow>();
  return row ?? null;
}

export function publicMember(row: MemberRow) {
  let status: unknown = null;
  try {
    status = row.status ? JSON.parse(row.status) : null;
  } catch {
    status = null;
  }
  return { deviceId: row.device_id, name: row.name, joinedAt: row.joined_at, lastSeen: row.last_seen, status };
}

export interface PublicSession {
  id: string;
  day: string;
  kind: string;
  startedAt: number;
  endedAt: number;
  minutes: number;
  taskId: string | null;
  taskLabel: string | null;
  deviceId: string | null;
  memberName: string | null;
  seq: number;
}

/** D1 hands rows back loosely typed, so coerce once, at the edge. */
export function publicSession(row: Record<string, unknown>): PublicSession {
  return {
    id: String(row.id),
    day: String(row.day),
    kind: String(row.kind),
    startedAt: Number(row.started_at),
    endedAt: Number(row.ended_at),
    minutes: Number(row.minutes),
    taskId: row.task_id ? String(row.task_id) : null,
    taskLabel: row.task_label ? String(row.task_label) : null,
    deviceId: row.device_id ? String(row.device_id) : null,
    memberName: row.member_name ? String(row.member_name) : null,
    seq: Number(row.seq),
  };
}
