/**
 * End-to-end smoke test for the FocusFlow API.
 * Usage: node scripts/test-api.mjs [baseUrl]
 */
const BASE = (process.argv[2] || process.env.BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');

let pass = 0;
const failures = [];

function check(label, condition, extra) {
  if (condition) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}${extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''}`);
  }
}

async function api(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'content-type': 'application/json', ...headers } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

console.log(`FocusFlow API smoke test against ${BASE}\n`);

/* 1. health + stats -------------------------------------------------- */
{
  const health = await api('GET', '/api/health');
  check('health returns ok', health.status === 200 && health.data?.ok === true, health);
  const stats = await api('GET', '/api/stats');
  check('stats returns counters', stats.status === 200 && typeof stats.data?.rooms === 'number', stats);
}

/* 2. create a room --------------------------------------------------- */
const devA = { id: 'devA-' + Math.random().toString(36).slice(2, 10), name: 'Laptop' };
const devB = { id: 'devB-' + Math.random().toString(36).slice(2, 10), name: 'Phone' };
let code = '';
let tokenA = '';
{
  const created = await api('POST', '/api/rooms', {
    deviceId: devA.id,
    deviceName: devA.name,
    roomName: 'Smoke test room',
    tz: 'Asia/Kolkata',
  });
  check('create room returns 201', created.status === 201, created);
  code = created.data?.room?.code ?? '';
  tokenA = created.data?.token ?? '';
  check('room code format looks right', /^[A-Z]+-[A-Z]+-\d{2}$/.test(code), code);
  check('create returns a device token', typeof tokenA === 'string' && tokenA.length > 10);
  check('create returns a shared doc', created.data?.doc?.mode === 'focus' && Array.isArray(created.data?.doc?.tasks));
  check('room timezone persisted', created.data?.room?.tz === 'Asia/Kolkata');
}

/* 3. meta lookup is case-insensitive -------------------------------- */
{
  const meta = await api('GET', `/api/rooms/${code.toLowerCase()}`);
  check('meta found with lowercase code', meta.status === 200 && meta.data?.room?.code === code, meta.data);
  const missing = await api('GET', '/api/rooms/NOPE-NOPE-99');
  check('unknown room returns 404', missing.status === 404, missing);
}

/* 4. second device joins ------------------------------------------- */
let tokenB = '';
{
  const join = await api('POST', `/api/rooms/${code}/join`, { deviceId: devB.id, deviceName: devB.name });
  check('join returns token + state', join.status === 200 && !!join.data?.token && join.data?.revision === 1, join.data);
  tokenB = join.data?.token ?? '';
  check('join lists both devices', join.data?.members?.length === 2, join.data?.members?.length);

  const again = await api('POST', `/api/rooms/${code}/join`, { deviceId: devB.id, deviceName: 'Phone renamed' });
  check('rejoining reuses the same token', again.data?.token === tokenB);
  check('rename sticks', again.data?.members?.some((m) => m.name === 'Phone renamed'));
}

/* 5. write access is gated on the token ----------------------------- */
{
  const bad = await api('POST', `/api/rooms/${code}/sync`, { deviceId: devB.id, token: 'not-a-token' });
  check('bad token rejected on sync', bad.status === 403 && bad.data?.error === 'not_a_member', bad);
  const badState = await api('POST', `/api/rooms/${code}/state`, {
    deviceId: devB.id,
    token: 'not-a-token',
    rev: 1,
    doc: { mode: 'focus' },
  });
  check('bad token rejected on state write', badState.status === 403, badState);
}

/* 6. shared timer document sync ------------------------------------ */
{
  const fromA = await api('POST', `/api/rooms/${code}/state`, {
    deviceId: devA.id,
    token: tokenA,
    deviceName: devA.name,
    rev: 1,
    doc: {
      mode: 'focus',
      running: true,
      startedAt: Date.now(),
      endsAt: Date.now() + 25 * 60000,
      remainingMs: 25 * 60000,
      tasks: [{ id: 't1', text: 'Read chapter 4', est: 2, done: false }],
      timer: { work: 25, short: 5, long: 15, interval: 4, goal: 8 },
      activeTaskId: 't1',
      updatedAt: Date.now(),
    },
  });
  check('state write accepted', fromA.status === 200 && fromA.data?.accepted === true, fromA.data);
  check('revision incremented', fromA.data?.revision === 2, fromA.data?.revision);

  const fromB = await api('POST', `/api/rooms/${code}/sync`, {
    deviceId: devB.id,
    token: tokenB,
    rev: 1,
    sessCursor: 0,
    tombCursor: 0,
    force: true,
    status: { mode: 'focus', running: true },
  });
  check('stale device receives the newer doc', fromB.status === 200 && fromB.data?.doc?.mode === 'focus', fromB.data);
  check('remote doc carries the task list', fromB.data?.doc?.tasks?.[0]?.text === 'Read chapter 4');
  check('sync reports members', Array.isArray(fromB.data?.members) && fromB.data.members.length === 2);
  check('sync echoes presence', fromB.data?.members?.some((m) => m.deviceId === devB.id && m.status?.mode === 'focus'));
  check('up-to-date device gets no doc', (await api('POST', `/api/rooms/${code}/sync`, {
    deviceId: devB.id,
    token: tokenB,
    rev: fromB.data.revision,
    sessCursor: fromB.data.sessCursor,
    tombCursor: fromB.data.tombCursor,
  })).data?.doc === null);

  const stale = await api('POST', `/api/rooms/${code}/state`, {
    deviceId: devB.id,
    token: tokenB,
    rev: 1,
    doc: { mode: 'short', timer: {} },
  });
  check('stale write is rejected and returns server doc', stale.data?.accepted === false && stale.data?.doc?.mode === 'focus', stale.data);
}

/* 7. session log ---------------------------------------------------- */
const today = dayKey();
const yesterday = dayKey(new Date(Date.now() - 86400000));
{
  const s1 = { id: `s:${code}:${1000}`, day: today, kind: 'focus', startedAt: Date.now() - 25 * 60000, endedAt: Date.now(), minutes: 25, taskId: 't1', taskLabel: 'Read chapter 4' };
  const s2 = { id: `s:${code}:${2000}`, day: today, kind: 'short', startedAt: Date.now() - 5 * 60000, endedAt: Date.now(), minutes: 5, taskId: null, taskLabel: null };
  const older = { id: `s:${code}:${500}`, day: yesterday, kind: 'focus', startedAt: Date.now() - 26 * 3600000, endedAt: Date.now() - 86400000, minutes: 50 };
  const post = await api('POST', `/api/rooms/${code}/sessions`, {
    deviceId: devA.id,
    token: tokenA,
    sessions: [s1, s2, older],
  });
  check('sessions inserted', post.status === 200 && post.data?.inserted === 3, post.data);

  const dupe = await api('POST', `/api/rooms/${code}/sessions`, { deviceId: devB.id, token: tokenB, sessions: [s1] });
  check('duplicate session id is ignored', dupe.data?.inserted === 0, dupe.data);

  const withSessions = await api('POST', `/api/rooms/${code}/sync`, {
    deviceId: devB.id,
    token: tokenB,
    rev: 2,
    sessCursor: 0,
    tombCursor: 0,
  });
  check('sync delivers the whole log', withSessions.data?.sessions?.length === 3, withSessions.data?.sessions?.length);
  const newestSeq = withSessions.data?.sessions?.[withSessions.data.sessions.length - 1]?.seq;
  check(
    'cursor advances to the newest row',
    typeof newestSeq === 'number' && withSessions.data?.sessCursor === newestSeq,
    { cursor: withSessions.data?.sessCursor, newestSeq },
  );
  check('session carries who logged it', withSessions.data?.sessions?.[0]?.memberName === devA.name);

  const incremental = await api('POST', `/api/rooms/${code}/sync`, {
    deviceId: devB.id,
    token: tokenB,
    rev: 2,
    sessCursor: withSessions.data.sessCursor,
    tombCursor: withSessions.data.tombCursor,
  });
  check('incremental sync returns nothing new', incremental.data?.sessions?.length === 0, incremental.data?.sessions);

  const meta = await api('GET', `/api/rooms/${code}`);
  check('meta totals match the log', meta.data?.totals?.sessions === 3 && meta.data?.totals?.minutes === 80, meta.data?.totals);

  const del = await api('POST', `/api/rooms/${code}/sessions/delete`, { deviceId: devA.id, token: tokenA, day: yesterday });
  check("yesterday's log can be reset", del.data?.deleted === 1, del.data);

  const afterDelete = await api('POST', `/api/rooms/${code}/sync`, {
    deviceId: devB.id,
    token: tokenB,
    rev: 2,
    sessCursor: withSessions.data.sessCursor,
    tombCursor: withSessions.data.tombCursor,
  });
  check('deletion propagates as a tombstone', afterDelete.data?.tombstones?.length === 1, afterDelete.data?.tombstones);

  const badSession = await api('POST', `/api/rooms/${code}/sessions`, {
    deviceId: devA.id,
    token: tokenA,
    sessions: [{ id: 'x', day: 'not-a-day', minutes: 25 }, { id: 'y', day: today, minutes: -5 }],
  });
  check('malformed sessions are dropped', badSession.data?.inserted === 0, badSession.data);
}

/* 8. rename + leave ------------------------------------------------- */
{
  const renamed = await api('PATCH', `/api/rooms/${code}`, {
    deviceId: devB.id,
    token: tokenB,
    name: 'Renamed room',
    tz: 'Europe/Paris',
  });
  check('room rename works', renamed.data?.room?.name === 'Renamed room' && renamed.data?.room?.tz === 'Europe/Paris', renamed.data?.room);

  const badTz = await api('PATCH', `/api/rooms/${code}`, { deviceId: devB.id, token: tokenB, tz: 'Not/AZone' });
  check('invalid timezone is ignored', badTz.data?.room?.tz === 'Europe/Paris', badTz.data?.room);

  const left = await api('POST', `/api/rooms/${code}/leave`, { deviceId: devB.id, token: tokenB });
  check('leave succeeds', left.data?.ok === true, left.data);
  const meta = await api('GET', `/api/rooms/${code}`);
  check('member removed on leave', meta.data?.members?.length === 1, meta.data?.members?.length);
  const noMore = await api('POST', `/api/rooms/${code}/sync`, { deviceId: devB.id, token: tokenB });
  check('left device can no longer sync', noMore.status === 403, noMore);
}

/* 9. presence freshness -------------------------------------------- */
{
  const devC = { id: 'devC-' + Math.random().toString(36).slice(2, 10) };
  const join = await api('POST', `/api/rooms/${code}/join`, { deviceId: devC.id, deviceName: 'iPad' });
  const tokenC = join.data?.token;
  const sync = await api('POST', `/api/rooms/${code}/sync`, {
    deviceId: devC.id,
    token: tokenC,
    force: true,
    status: { mode: 'short', running: false, remainingMs: 120000 },
  });
  const me = sync.data?.members?.find((m) => m.deviceId === devC.id);
  check('presence status stored', me?.status?.mode === 'short', me);
  check('presence timestamps are fresh', typeof me?.lastSeen === 'number' && Date.now() - me.lastSeen < 15000, me?.lastSeen);
  const stats = await api('GET', '/api/stats');
  check('stats counts the new room', stats.data?.rooms >= 1, stats.data?.rooms);
}

/* 10. rate/abuse guards ------------------------------------------- */
{
  const huge = await api('POST', `/api/rooms/${code}/sessions`, {
    deviceId: devA.id,
    token: tokenA,
    sessions: Array.from({ length: 500 }, (_, i) => ({ id: `bulk-${i}`, day: today, minutes: 25 })),
  });
  check('session batches are capped', huge.data?.inserted <= 300, huge.data?.inserted);
}

/* 11. burning a room ---------------------------------------------- */
{
  const owner = { id: 'devDel-' + Math.random().toString(36).slice(2, 10), name: 'Owner' };
  const other = { id: 'devDel2-' + Math.random().toString(36).slice(2, 10), name: 'Other' };
  const created = await api('POST', '/api/rooms', { deviceId: owner.id, deviceName: owner.name, roomName: 'Doomed room' });
  const dcode = created.data?.room?.code ?? '';
  const dtoken = created.data?.token ?? '';
  check('destroy: room created', created.status === 201 && !!dcode, created.status);

  const join = await api('POST', `/api/rooms/${dcode}/join`, { deviceId: other.id, deviceName: other.name });
  const otoken = join.data?.token ?? '';
  await api('POST', `/api/rooms/${dcode}/sessions`, {
    deviceId: owner.id,
    token: dtoken,
    sessions: [{ id: `s:${dcode}:1`, day: today, kind: 'focus', startedAt: Date.now() - 60000, endedAt: Date.now(), minutes: 1 }],
  });

  const badToken = await api('POST', `/api/rooms/${dcode}/destroy`, { deviceId: owner.id, token: 'nope' });
  check('destroy: rejects a bad token', badToken.status === 403 && badToken.data?.error === 'not_a_member', badToken);

  const burned = await api('POST', `/api/rooms/${dcode}/destroy`, { deviceId: owner.id, token: dtoken });
  check(
    'destroy: a member can burn the room',
    burned.status === 200 && burned.data?.ok === true && burned.data?.destroyed === true,
    burned.data,
  );

  const gone = await api('GET', `/api/rooms/${dcode}`);
  check('destroy: the room row is gone', gone.status === 404, gone.status);

  const otherSync = await api('POST', `/api/rooms/${dcode}/sync`, { deviceId: other.id, token: otoken });
  check('destroy: other devices are disconnected', otherSync.status === 403, otherSync.status);

  const rejoin = await api('POST', `/api/rooms/${dcode}/join`, { deviceId: other.id, deviceName: other.name });
  check('destroy: the code cannot be reused', rejoin.status === 404, rejoin.status);

  const fresh = await api('POST', '/api/rooms', { deviceId: owner.id, deviceName: owner.name });
  check('destroy: new rooms still mint fresh codes', fresh.status === 201 && fresh.data?.room?.code !== dcode);
}

console.log(`\n${pass} checks passed, ${failures.length} failed`);
if (failures.length) {
  console.log('failed checks:\n' + failures.map((f) => ' - ' + f).join('\n'));
  process.exit(1);
}
process.exit(0);
