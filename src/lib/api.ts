import type { Bootstrap, GlobalStats, RoomDoc, RoomMeta, RoomTotals, Session, SyncResult } from './types';

/** Server clock offset so countdowns agree across devices with skewed clocks. */
let clockOffset = 0;
export const serverNow = () => Date.now() + clockOffset;

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.status = status;
    this.code = code;
  }
  get offline() {
    return this.status === 0;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'offline', 'Network request failed');
  }
  const rtt = Date.now() - started;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  const payload = (data ?? {}) as Record<string, unknown>;
  if (typeof payload.serverTime === 'number') {
    // Midpoint estimate keeps the countdown honest without a second round trip.
    clockOffset = payload.serverTime + rtt / 2 - Date.now();
  }
  if (!res.ok) {
    throw new ApiError(res.status, String(payload.error ?? `http_${res.status}`), String(payload.detail ?? ''));
  }
  return data as T;
}

const base = (code: string) => `/api/rooms/${encodeURIComponent(code)}`;

export const api = {
  stats: () => request<GlobalStats>('GET', '/api/stats'),

  createRoom: (input: { deviceId: string; deviceName: string; roomName?: string; tz?: string }) =>
    request<Bootstrap & { room: RoomMeta }>('POST', '/api/rooms', input),

  meta: (code: string) =>
    request<{ room: RoomMeta; totals: RoomTotals; members: Bootstrap['members']; serverTime: number }>(
      'GET',
      base(code),
    ),

  join: (code: string, input: { deviceId: string; deviceName: string }) =>
    request<Bootstrap>('POST', `${base(code)}/join`, input),

  leave: (code: string, input: { deviceId: string; token: string }) =>
    request<{ ok: boolean }>('POST', `${base(code)}/leave`, input),

  sync: (
    code: string,
    input: {
      deviceId: string;
      token: string;
      deviceName: string;
      rev: number;
      sessCursor: number;
      tombCursor: number;
      status: unknown;
      force?: boolean;
    },
  ) => request<SyncResult>('POST', `${base(code)}/sync`, input),

  putState: (
    code: string,
    input: { deviceId: string; token: string; deviceName: string; rev: number; doc: RoomDoc },
  ) =>
    request<{ accepted: boolean; revision: number; doc?: RoomDoc; updatedAt?: number; updatedBy?: string | null }>(
      'POST',
      `${base(code)}/state`,
      input,
    ),

  postSessions: (code: string, input: { deviceId: string; token: string; sessions: Session[] }) =>
    request<{ inserted: number; serverTime: number }>('POST', `${base(code)}/sessions`, input),

  deleteSessions: (
    code: string,
    input: { deviceId: string; token: string; day?: string; ids?: string[]; all?: boolean },
  ) => request<{ deleted: number }>('POST', `${base(code)}/sessions/delete`, input),

  patchRoom: (
    code: string,
    input: { deviceId: string; token: string; name?: string; tz?: string },
  ) => request<{ room: RoomMeta }>('PATCH', base(code), input),
};
