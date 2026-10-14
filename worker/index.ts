/**
 * FocusFlow API — rooms, a shared timer document, and an append-only session log
 * on Cloudflare Workers + D1.
 *
 * Auth model: the room code is the shared secret. Each device receives a private
 * token when it joins; every write must present that (device, token) pair. There
 * are no accounts, and a device that has joined keeps working forever.
 */
import {
  LIMITS,
  defaultDoc,
  fail,
  findMember,
  int,
  isDayKey,
  isTimeZone,
  json,
  looksLikeCode,
  makeCode,
  normalizeCode,
  publicMember,
  publicSession,
  readJson,
  sanitizeDoc,
  sanitizeSession,
  str,
  type Env,
  type MemberRow,
} from './lib.js';
import { SCHEMA_STATEMENTS } from './schema.js';

export type { Env };

const NO_STORE = { 'cache-control': 'no-store' } as const;

/* In-isolate cache for the public landing-page counters. Invalidated on write. */
let statsCache: { at: number; data: unknown } = { at: 0, data: null };
const STATS_TTL = 15000;

/* Applied once per isolate; makes a brand new database usable on first request. */
let schemaReady: Promise<void> | null = null;

function ensureSchema(env: Env): Promise<void> {
  if (!schemaReady) {
    schemaReady = env.DB.batch(SCHEMA_STATEMENTS.map((sql) => env.DB.prepare(sql)))
      .then(() => undefined)
      .catch((error) => {
        schemaReady = null; // let the next request try again
        throw error;
      });
  }
  return schemaReady;
}

/**
 * The entire `/api` surface: schema bootstrap + router, wrapped in error
 * handling. Shared by the Cloudflare Worker below and the Vercel function in
 * `api/` so both hosts run identical logic.
 */
export async function handleApi(request: Request, env: Env): Promise<Response> {
  try {
    await ensureSchema(env);
    const url = new URL(request.url);
    const res = await route(request, env, url);
    return res ?? fail(404, 'not_found');
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error';
    return fail(500, 'server_error', detail);
  }
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) return handleApi(request, env);

    // Everything else is the static client.
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('FocusFlow API is running. Static assets are not attached to this deployment.', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
};

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

async function route(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  if (path === '/api/health' && method === 'GET') {
    return json({ ok: true, name: env.APP_NAME || 'FocusFlow', serverTime: Date.now() });
  }
  if (path === '/api/stats' && method === 'GET') return handleStats(env);
  if (path === '/api/rooms' && method === 'POST') return handleCreate(env, request);

  const roomMatch = path.match(/^\/api\/rooms\/([^/]+)$/);
  if (roomMatch) {
    const code = normalizeCode(roomMatch[1]);
    if (!looksLikeCode(code)) return fail(400, 'bad_code');
    if (method === 'GET') return handleMeta(env, code);
    if (method === 'PATCH') return handleRename(env, request, code);
    return fail(405, 'method_not_allowed');
  }

  const actionMatch = path.match(/^\/api\/rooms\/([^/]+)\/([a-z/]+)$/);
  if (actionMatch) {
    const code = normalizeCode(actionMatch[1]);
    const action = actionMatch[2];
    if (!looksLikeCode(code)) return fail(400, 'bad_code');
    if (method !== 'POST') return fail(405, 'method_not_allowed');
    switch (action) {
      case 'join':
        return handleJoin(env, request, code);
      case 'sync':
        return handleSync(env, request, code);
      case 'state':
        return handleState(env, request, code);
      case 'sessions':
        return handleSessions(env, request, code);
      case 'sessions/delete':
        return handleSessionDelete(env, request, code);
      case 'leave':
        return handleLeave(env, request, code);
      case 'destroy':
        return handleDestroy(env, request, code);
      default:
        return fail(404, 'not_found');
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Rooms                                                               */
/* ------------------------------------------------------------------ */

async function handleCreate(env: Env, request: Request): Promise<Response> {
  const body = (await readJson(request)) ?? {};
  const now = Date.now();
  const deviceId = str(body.deviceId, 64);
  if (!deviceId) return fail(400, 'missing_device');

  const name = str(body.roomName, 60, 'Study room');
  const tz = isTimeZone(body.tz) ? (body.tz as string) : 'UTC';
  const deviceName = str(body.deviceName, 40, 'This device');
  const doc = sanitizeDoc(body.doc ?? undefined, now) ?? defaultDoc(now);
  const token = crypto.randomUUID();

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCode();
    try {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO rooms (code, name, tz, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(code, name, tz, now, now, deviceId),
        env.DB.prepare('INSERT INTO room_state (code, revision, doc, updated_at, updated_by) VALUES (?, 1, ?, ?, ?)')
          .bind(code, JSON.stringify(doc), now, deviceName),
        env.DB.prepare('INSERT INTO members (code, device_id, name, token, joined_at, last_seen, status) VALUES (?, ?, ?, ?, ?, ?, NULL)')
          .bind(code, deviceId, deviceName, token, now, now),
      ]);
      statsCache = { at: 0, data: null };
      return json(
        {
          room: { code, name, tz, createdAt: now },
          token,
          revision: 1,
          doc,
          members: [{ deviceId, name: deviceName, joinedAt: now, lastSeen: now, status: null }],
          serverTime: now,
        },
        201,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (!/UNIQUE|constraint/i.test(message)) throw error;
    }
  }
  return fail(503, 'code_exhausted');
}

async function roomRow(env: Env, code: string) {
  return env.DB.prepare('SELECT code, name, tz, created_at, created_by FROM rooms WHERE code = ?')
    .bind(code)
    .first<{ code: string; name: string; tz: string; created_at: number; created_by: string | null }>();
}

async function handleMeta(env: Env, code: string): Promise<Response> {
  const room = await roomRow(env, code);
  if (!room) return fail(404, 'room_not_found');
  const totals = await env.DB.prepare(
    'SELECT COUNT(*) AS sessions, COALESCE(SUM(minutes), 0) AS minutes FROM sessions WHERE code = ?',
  )
    .bind(code)
    .first<{ sessions: number; minutes: number }>();
  const members = await env.DB.prepare(
    'SELECT * FROM members WHERE code = ? ORDER BY last_seen DESC LIMIT ?',
  )
    .bind(code, LIMITS.membersReturned)
    .all<MemberRow>();
  return json(
    {
      room: { code: room.code, name: room.name, tz: room.tz, createdAt: room.created_at },
      totals: { sessions: totals?.sessions ?? 0, minutes: totals?.minutes ?? 0 },
      members: (members.results ?? []).map((row) => publicMember(row)),
      serverTime: Date.now(),
    },
    200,
    NO_STORE,
  );
}

async function handleRename(env: Env, request: Request, code: string): Promise<Response> {
  const body = (await readJson(request)) ?? {};
  const member = await findMember(env, code, str(body.deviceId, 64), str(body.token, 64));
  if (!member) return fail(403, 'not_a_member');
  const room = await roomRow(env, code);
  if (!room) return fail(404, 'room_not_found');

  const name = str(body.name, 60, room.name);
  const tz = isTimeZone(body.tz) ? (body.tz as string) : room.tz;
  const now = Date.now();
  await env.DB.prepare('UPDATE rooms SET name = ?, tz = ?, updated_at = ? WHERE code = ?')
    .bind(name, tz, now, code)
    .run();
  return json({ room: { code, name, tz, createdAt: room.created_at }, serverTime: now });
}

async function handleJoin(env: Env, request: Request, code: string): Promise<Response> {
  const body = (await readJson(request)) ?? {};
  const now = Date.now();
  const deviceId = str(body.deviceId, 64);
  if (!deviceId) return fail(400, 'missing_device');
  const deviceName = str(body.deviceName, 40, 'This device');

  const room = await roomRow(env, code);
  if (!room) return fail(404, 'room_not_found');

  const existing = await env.DB.prepare('SELECT * FROM members WHERE code = ? AND device_id = ?')
    .bind(code, deviceId)
    .first<{ token: string }>();

  const token = existing?.token ?? crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO members (code, device_id, name, token, joined_at, last_seen, status)
     VALUES (?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT (code, device_id) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen`,
  )
    .bind(code, deviceId, deviceName, token, now, now)
    .run();

  const state = await env.DB.prepare('SELECT revision, doc FROM room_state WHERE code = ?')
    .bind(code)
    .first<{ revision: number; doc: string }>();
  const sessions = await env.DB.prepare(
    'SELECT * FROM sessions WHERE code = ? ORDER BY seq DESC LIMIT ?',
  )
    .bind(code, LIMITS.sessionFetch)
    .all();
  const members = await env.DB.prepare('SELECT * FROM members WHERE code = ? ORDER BY last_seen DESC LIMIT ?')
    .bind(code, LIMITS.membersReturned)
    .all<MemberRow>();
  const cursors = await env.DB.prepare(
    `SELECT (SELECT COALESCE(MAX(seq), 0) FROM sessions WHERE code = ?) AS sess,
            (SELECT COALESCE(MAX(seq), 0) FROM session_tombstones WHERE code = ?) AS tomb`,
  )
    .bind(code, code)
    .first<{ sess: number; tomb: number }>();

  return json(
    {
      room: { code: room.code, name: room.name, tz: room.tz, createdAt: room.created_at },
      token,
      revision: state?.revision ?? 1,
      doc: state ? JSON.parse(state.doc) : defaultDoc(now),
      sessions: (sessions.results ?? []).map((row) => publicSession(row)).reverse(),
      sessCursor: cursors?.sess ?? 0,
      tombCursor: cursors?.tomb ?? 0,
      members: (members.results ?? []).map((row) => publicMember(row)),
      serverTime: now,
    },
    200,
    NO_STORE,
  );
}

async function handleLeave(env: Env, request: Request, code: string): Promise<Response> {
  const body = (await readJson(request)) ?? {};
  const member = await findMember(env, code, str(body.deviceId, 64), str(body.token, 64));
  if (!member) return json({ ok: true });
  await env.DB.prepare('DELETE FROM members WHERE code = ? AND device_id = ?').bind(code, member.device_id).run();
  return json({ ok: true, serverTime: Date.now() });
}

/**
 * Burn a room. This is the destructive counterpart to /leave: it deletes the
 * room row, its shared state, its member list and its whole session log, so the
 * code stops working everywhere. Any member may do it (rooms have no owner), and
 * every other device finds out on its next sync — the member row is gone, so the
 * API answers 403, the client re-joins, the room lookup answers 404, and the
 * device drops back to the "does not exist" screen by itself.
 */
async function handleDestroy(env: Env, request: Request, code: string): Promise<Response> {
  const body = (await readJson(request)) ?? {};
  const member = await findMember(env, code, str(body.deviceId, 64), str(body.token, 64));
  if (!member) return fail(403, 'not_a_member');

  const now = Date.now();
  // Explicit deletes for every table: the worker never enables PRAGMA
  // foreign_keys, so ON DELETE CASCADE is not guaranteed to fire.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM session_tombstones WHERE code = ?').bind(code),
    env.DB.prepare('DELETE FROM sessions WHERE code = ?').bind(code),
    env.DB.prepare('DELETE FROM members WHERE code = ?').bind(code),
    env.DB.prepare('DELETE FROM room_state WHERE code = ?').bind(code),
    env.DB.prepare('DELETE FROM rooms WHERE code = ?').bind(code),
  ]);
  statsCache = { at: 0, data: null };
  return json({ ok: true, destroyed: true, serverTime: now });
}

/* ------------------------------------------------------------------ */
/* Sync loop                                                           */
/* ------------------------------------------------------------------ */

async function handleSync(env: Env, request: Request, code: string): Promise<Response> {
  const body = (await readJson(request)) ?? {};
  const now = Date.now();
  const member = await findMember(env, code, str(body.deviceId, 64), str(body.token, 64));
  if (!member) return fail(403, 'not_a_member');

  const room = await roomRow(env, code);
  if (!room) return fail(404, 'room_not_found');

  // Presence: heartbeat at most every 4s unless the device explicitly asks.
  const status = body.status && typeof body.status === 'object' ? JSON.stringify(body.status).slice(0, 400) : null;
  const name = str(body.deviceName, 40, member.name);
  if (body.force === true || now - member.last_seen > 4000) {
    await env.DB.prepare('UPDATE members SET last_seen = ?, status = ?, name = ? WHERE code = ? AND device_id = ?')
      .bind(now, status, name, code, member.device_id)
      .run();
  }

  const state = await env.DB.prepare('SELECT revision, doc, updated_at, updated_by FROM room_state WHERE code = ?')
    .bind(code)
    .first<{ revision: number; doc: string; updated_at: number; updated_by: string | null }>();
  const revision = state?.revision ?? 1;

  const clientRev = int(body.rev, 0, Number.MAX_SAFE_INTEGER);
  let doc: unknown = null;
  if (clientRev !== revision && state) {
    doc = JSON.parse(state.doc);
  }

  const sessCursor = int(body.sessCursor, 0, Number.MAX_SAFE_INTEGER) ?? 0;
  const tombCursor = int(body.tombCursor, 0, Number.MAX_SAFE_INTEGER) ?? 0;

  const sessions = await env.DB.prepare(
    `SELECT * FROM sessions WHERE code = ? AND seq > ? ORDER BY seq ASC LIMIT ?`,
  )
    .bind(code, sessCursor, LIMITS.sessionFetch)
    .all();

  const tombstones = await env.DB.prepare(
    'SELECT seq, id FROM session_tombstones WHERE code = ? AND seq > ? ORDER BY seq ASC LIMIT 500',
  )
    .bind(code, tombCursor)
    .all<{ seq: number; id: string }>();

  const members = await env.DB.prepare('SELECT * FROM members WHERE code = ? ORDER BY last_seen DESC LIMIT ?')
    .bind(code, LIMITS.membersReturned)
    .all<MemberRow>();

  const newestSess = await env.DB.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM sessions WHERE code = ?')
    .bind(code)
    .first<{ s: number }>();
  const newestTomb = await env.DB.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM session_tombstones WHERE code = ?')
    .bind(code)
    .first<{ s: number }>();

  // Cheap housekeeping, occasionally.
  if (Math.random() < 0.02) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM members WHERE code = ? AND last_seen < ?').bind(code, now - LIMITS.staleMemberMs),
      env.DB.prepare('DELETE FROM session_tombstones WHERE code = ? AND created_at < ?').bind(
        code,
        now - LIMITS.tombstoneMs,
      ),
      env.DB.prepare('UPDATE rooms SET updated_at = ? WHERE code = ?').bind(now, code),
    ]);
  }

  const rows = (sessions.results ?? []).map((row) => publicSession(row));
  return json(
    {
      serverTime: now,
      revision,
      doc,
      updatedAt: state?.updated_at ?? now,
      updatedBy: state?.updated_by ?? null,
      sessions: rows,
      sessCursor: Math.max(sessCursor, rows.length ? rows[rows.length - 1].seq : newestSess?.s ?? 0),
      tombstones: (tombstones.results ?? []).map((t) => t.id),
      tombCursor: Math.max(tombCursor, newestTomb?.s ?? 0),
      hasMore: rows.length >= LIMITS.sessionFetch,
      members: (members.results ?? []).map((row) => publicMember(row)),
      room: { code: room.code, name: room.name, tz: room.tz, createdAt: room.created_at },
    },
    200,
    NO_STORE,
  );
}

/* ------------------------------------------------------------------ */
/* Shared timer document                                               */
/* ------------------------------------------------------------------ */

async function handleState(env: Env, request: Request, code: string): Promise<Response> {
  const body = (await readJson(request)) ?? {};
  const now = Date.now();
  const member = await findMember(env, code, str(body.deviceId, 64), str(body.token, 64));
  if (!member) return fail(403, 'not_a_member');

  const serialized = JSON.stringify(body.doc ?? null);
  if (serialized.length > LIMITS.docBytes) return fail(413, 'doc_too_large');
  const doc = sanitizeDoc(body.doc, now);
  if (!doc) return fail(400, 'bad_doc');

  const clientRev = int(body.rev, 0, Number.MAX_SAFE_INTEGER);
  if (clientRev === null) return fail(400, 'missing_rev');

  const result = await env.DB.prepare(
    `UPDATE room_state SET revision = revision + 1, doc = ?, updated_at = ?, updated_by = ?
     WHERE code = ? AND revision <= ?`,
  )
    .bind(JSON.stringify(doc), now, str(body.deviceName, 40, member.name), code, clientRev)
    .run();

  const accepted = (result.meta?.changes ?? 0) > 0;
  const state = await env.DB.prepare('SELECT revision, doc, updated_at, updated_by FROM room_state WHERE code = ?')
    .bind(code)
    .first<{ revision: number; doc: string; updated_at: number; updated_by: string | null }>();

  if (accepted) {
    return json({ accepted: true, revision: state?.revision ?? clientRev + 1, serverTime: now });
  }
  return json({
    accepted: false,
    revision: state?.revision ?? clientRev,
    doc: state ? JSON.parse(state.doc) : null,
    updatedAt: state?.updated_at ?? now,
    updatedBy: state?.updated_by ?? null,
    serverTime: now,
  });
}

/* ------------------------------------------------------------------ */
/* Session log                                                         */
/* ------------------------------------------------------------------ */

async function handleSessions(env: Env, request: Request, code: string): Promise<Response> {
  const body = (await readJson(request)) ?? {};
  const now = Date.now();
  const member = await findMember(env, code, str(body.deviceId, 64), str(body.token, 64));
  if (!member) return fail(403, 'not_a_member');

  const input = Array.isArray(body.sessions) ? body.sessions.slice(0, LIMITS.sessionBatch) : [];
  const rows = input.map((s) => sanitizeSession(s, now)).filter((s): s is NonNullable<typeof s> => s !== null);
  if (!rows.length) return json({ inserted: 0, serverTime: now });

  const statements = rows.map((row) =>
    env.DB.prepare(
      `INSERT OR IGNORE INTO sessions
        (id, code, device_id, member_name, day, kind, started_at, ended_at, minutes, task_id, task_label, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      row.id,
      code,
      member.device_id,
      member.name,
      row.day,
      row.kind,
      row.startedAt,
      row.endedAt,
      row.minutes,
      row.taskId,
      row.taskLabel,
      now,
    ),
  );

  const results = await env.DB.batch(statements);
  const inserted = results.reduce((n, r) => n + ((r.meta?.changes ?? 0) > 0 ? 1 : 0), 0);
  if (inserted) statsCache = { at: 0, data: null };
  return json({ inserted, accepted: rows.length, serverTime: now });
}

async function handleSessionDelete(env: Env, request: Request, code: string): Promise<Response> {
  const body = (await readJson(request)) ?? {};
  const now = Date.now();
  const member = await findMember(env, code, str(body.deviceId, 64), str(body.token, 64));
  if (!member) return fail(403, 'not_a_member');

  let rows: { id: string }[] = [];
  if (body.all === true) {
    rows = (await env.DB.prepare('SELECT id FROM sessions WHERE code = ?').bind(code).all<{ id: string }>()).results ?? [];
  } else if (Array.isArray(body.ids) && body.ids.length) {
    const ids = body.ids.slice(0, LIMITS.sessionDelete).map((id) => str(id, 80)).filter(Boolean);
    if (!ids.length) return json({ deleted: 0, serverTime: now });
    const placeholders = ids.map(() => '?').join(',');
    rows = (
      await env.DB.prepare(`SELECT id FROM sessions WHERE code = ? AND id IN (${placeholders})`)
        .bind(code, ...ids)
        .all<{ id: string }>()
    ).results ?? [];
  } else if (isDayKey(body.day)) {
    rows = (
      await env.DB.prepare('SELECT id FROM sessions WHERE code = ? AND day = ?')
        .bind(code, body.day)
        .all<{ id: string }>()
    ).results ?? [];
  } else {
    return fail(400, 'nothing_to_delete');
  }

  if (!rows.length) return json({ deleted: 0, serverTime: now });
  const ids = rows.map((r) => r.id);
  const statements = ids.map((id) =>
    env.DB.prepare('INSERT INTO session_tombstones (code, id, created_at) VALUES (?, ?, ?)').bind(code, id, now),
  );
  statements.push(
    env.DB.prepare(`DELETE FROM sessions WHERE code = ? AND id IN (${ids.map(() => '?').join(',')})`).bind(code, ...ids),
  );
  await env.DB.batch(statements);
  statsCache = { at: 0, data: null };
  return json({ deleted: ids.length, serverTime: now });
}

/* ------------------------------------------------------------------ */
/* Public counters                                                     */
/* ------------------------------------------------------------------ */

async function handleStats(env: Env): Promise<Response> {
  const now = Date.now();
  if (statsCache.data && now - statsCache.at < STATS_TTL) {
    return json(statsCache.data, 200, { 'cache-control': 'public, max-age=15' });
  }
  const totals = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM rooms) AS rooms,
       (SELECT COUNT(*) FROM members) AS members,
       (SELECT COUNT(*) FROM sessions) AS sessions,
       (SELECT COALESCE(SUM(minutes), 0) FROM sessions) AS minutes,
       (SELECT COUNT(*) FROM sessions WHERE created_at > ?) AS sessions24h,
       (SELECT COALESCE(SUM(minutes), 0) FROM sessions WHERE created_at > ?) AS minutes24h`,
  )
    .bind(now - 86400000, now - 86400000)
    .first<{
      rooms: number;
      members: number;
      sessions: number;
      minutes: number;
      sessions24h: number;
      minutes24h: number;
    }>();

  const focusSessions = await env.DB.prepare("SELECT COUNT(*) AS f FROM sessions WHERE kind = 'focus'")
    .first<{ f: number }>();

  const data = {
    rooms: totals?.rooms ?? 0,
    members: totals?.members ?? 0,
    sessions: totals?.sessions ?? 0,
    focusSessions: focusSessions?.f ?? 0,
    minutes: totals?.minutes ?? 0,
    sessions24h: totals?.sessions24h ?? 0,
    minutes24h: totals?.minutes24h ?? 0,
    serverTime: now,
  };
  statsCache = { at: now, data };
  return json(data, 200, { 'cache-control': 'public, max-age=15' });
}
