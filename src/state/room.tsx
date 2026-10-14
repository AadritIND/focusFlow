import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, api, serverNow } from '../lib/api';
import {
  forgetRoom,
  loadDevice,
  loadPrefs,
  loadRoomCache,
  membership,
  rememberDeleted,
  rememberRoom,
  savePrefs,
  saveRoomCache,
  touchRoom,
  deletedIds,
  type Membership,
} from '../lib/device';
import { playChime, playTick } from '../lib/audio';
import { dayKey } from '../lib/time';
import type { Member, Mode, Prefs, RoomDoc, RoomMeta, Session, TimerSettings } from '../lib/types';
import { DEFAULT_TIMER, modeMinutes } from '../lib/types';

export type SyncStatus = 'connecting' | 'live' | 'offline' | 'error';

export interface RoomValue {
  code: string;
  meta: RoomMeta;
  doc: RoomDoc;
  sessions: Session[];
  members: Member[];
  onlineIds: Set<string>;
  status: SyncStatus;
  error: string | null;
  lastSyncAt: number;
  now: number;
  remaining: number;
  modeDuration: number;
  progress: number;
  me: { deviceId: string; name: string; token: string };
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  skip: () => void;
  finishNow: () => void;
  setMode: (mode: Mode) => void;
  patchDoc: (patch: Partial<RoomDoc>) => void;
  setTimer: (patch: Partial<TimerSettings>) => void;
  addTask: (text: string, est: number) => void;
  updateTask: (id: string, patch: { text?: string; est?: number; done?: boolean }) => void;
  removeTask: (id: string) => void;
  selectTask: (id: string | null) => void;
  clearCompletedTasks: () => void;
  deleteSessions: (input: { day?: string; ids?: string[]; all?: boolean }) => Promise<void>;
  renameRoom: (name: string) => Promise<void>;
  setRoomTz: (tz: string) => Promise<void>;
  renameDevice: (name: string) => void;
  leaveRoom: () => Promise<void>;
  destroyRoom: () => Promise<boolean>;
  refresh: (force?: boolean) => void;
}

const RoomContext = createContext<RoomValue | null>(null);

const POLL_LIVE = 1100;
const POLL_HIDDEN = 4000;
const REJOIN_COOLDOWN = 20000;
const PUSH_DEBOUNCE = 320;
const ONLINE_WINDOW = 25000;
const STALE_COMPLETION_MS = 6 * 3600 * 1000;

const emptyDoc = (): RoomDoc => ({
  v: 1,
  mode: 'focus',
  running: false,
  startedAt: 0,
  endsAt: 0,
  remainingMs: DEFAULT_TIMER.work * 60000,
  cycle: 0,
  intention: '',
  activeTaskId: null,
  tasks: [],
  timer: { ...DEFAULT_TIMER },
  updatedAt: 0,
  updatedBy: null,
});

const durationOf = (doc: RoomDoc, mode: Mode) => Math.max(60_000, modeMinutes(doc.timer, mode) * 60000);

const nextMode = (doc: RoomDoc): Mode =>
  doc.mode === 'focus' ? ((doc.cycle + 1) % Math.max(1, doc.timer.interval) === 0 ? 'long' : 'short') : 'focus';

export function RoomProvider({ code, children }: { code: string; children: ReactNode }) {
  const upper = code.toUpperCase();

  const deviceRef = useRef(loadDevice());
  const [prefs, setPrefsState] = useState<Prefs>(() => loadPrefs());
  const [member, setMember] = useState<Membership | null>(() => membership(upper));
  const [meta, setMeta] = useState<RoomMeta>(() => {
    const cached = loadRoomCache(upper);
    const known = membership(upper);
    return {
      code: upper,
      name: cached?.name ?? known?.name ?? 'Study room',
      tz: cached?.tz ?? 'UTC',
      createdAt: Date.now(),
    };
  });
  const [doc, setDoc] = useState<RoomDoc>(() => loadRoomCache(upper)?.doc ?? emptyDoc());
  const [sessions, setSessions] = useState<Session[]>(() => loadRoomCache(upper)?.sessions ?? []);
  const [members, setMembers] = useState<Member[]>([]);
  const [status, setStatus] = useState<SyncStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState(0);
  const [now, setNow] = useState(() => serverNow());

  /* Refs mirror the latest values for use inside timers. */
  const docRef = useRef(doc);
  const revisionRef = useRef(loadRoomCache(upper)?.revision ?? 0);
  const sessCursorRef = useRef(loadRoomCache(upper)?.sessCursor ?? 0);
  const tombCursorRef = useRef(loadRoomCache(upper)?.tombCursor ?? 0);
  const metaRef = useRef(meta);
  const memberRef = useRef(member);
  const sessionsRef = useRef(sessions);
  const membersRef = useRef(members);
  const prefsRef = useRef(prefs);
  const pendingPush = useRef(false);
  const pushTimer = useRef<number | null>(null);
  const inFlight = useRef(false);
  const lastPushHash = useRef('');
  const deletedRef = useRef<Set<string>>(deletedIds(upper));
  const failureRef = useRef(0);
  const completionGuard = useRef('');
  const rejoinAt = useRef(0);
  /** Set once the room is gone for good; stops the sync loop and shows a way out. */
  const fatalRef = useRef<string | null>(null);

  const applyDoc = useCallback((next: RoomDoc, revision?: number) => {
    docRef.current = next;
    if (typeof revision === 'number') revisionRef.current = revision;
    setDoc(next);
  }, []);

  const setSessionsBoth = useCallback((updater: (prev: Session[]) => Session[]) => {
    setSessions((prev) => {
      const next = updater(prev);
      sessionsRef.current = next;
      return next;
    });
  }, []);

  /* ---------------------------------------------------------------- */
  /* Local cache                                                       */
  /* ---------------------------------------------------------------- */

  const persist = useCallback(() => {
    if (!memberRef.current) return;
    saveRoomCache(upper, {
      revision: revisionRef.current,
      doc: docRef.current,
      sessions: sessionsRef.current,
      sessCursor: sessCursorRef.current,
      tombCursor: tombCursorRef.current,
      name: metaRef.current.name,
      tz: metaRef.current.tz,
      savedAt: Date.now(),
    });
  }, [upper]);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);
  useEffect(() => {
    membersRef.current = members;
  }, [members]);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  /* ---------------------------------------------------------------- */
  /* Push the shared document (last write wins on the revision)         */
  /* ---------------------------------------------------------------- */

  const pushNow = useCallback(async () => {
    const current = memberRef.current;
    if (!current || inFlight.current) return;
    const payload = docRef.current;
    const hash = `${payload.mode}|${payload.running}|${payload.startedAt}|${payload.endsAt}|${payload.remainingMs}|${payload.cycle}|${payload.tasks.length}|${payload.activeTaskId}|${payload.intention}|${JSON.stringify(payload.timer)}|${payload.tasks.map((t) => `${t.id}${t.text}${t.est}${t.done ? 1 : 0}`).join(',')}`;
    inFlight.current = true;
    try {
      const result = await api.putState(upper, {
        deviceId: deviceRef.current.id,
        token: current.token,
        deviceName: deviceRef.current.name,
        rev: revisionRef.current,
        doc: { ...payload, updatedAt: Date.now(), updatedBy: deviceRef.current.name },
      });
      if (result.accepted) {
        revisionRef.current = result.revision;
        lastPushHash.current = hash;
        setStatus('live');
      } else if (result.doc) {
        applyDoc(result.doc, result.revision);
        lastPushHash.current = '';
      }
      persist();
    } catch (err) {
      const apiErr = err as ApiError;
      setStatus(apiErr.offline ? 'offline' : 'error');
      if (!apiErr.offline) setError(apiErr.code);
    } finally {
      inFlight.current = false;
      pendingPush.current = false;
    }
  }, [applyDoc, persist, upper]);

  const queuePush = useCallback(
    (immediate = false) => {
      pendingPush.current = true;
      if (pushTimer.current !== null) window.clearTimeout(pushTimer.current);
      pushTimer.current = window.setTimeout(() => void pushNow(), immediate ? 0 : PUSH_DEBOUNCE);
    },
    [pushNow],
  );

  const mutateDoc = useCallback(
    (patch: Partial<RoomDoc>, immediate = false) => {
      const next: RoomDoc = { ...docRef.current, ...patch, updatedAt: Date.now(), updatedBy: deviceRef.current.name };
      docRef.current = next;
      setDoc(next);
      persist();
      queuePush(immediate);
      return next;
    },
    [persist, queuePush],
  );

  /* ---------------------------------------------------------------- */
  /* Sessions                                                          */
  /* ---------------------------------------------------------------- */

  const uploadPending = useCallback(async () => {
    const current = memberRef.current;
    if (!current) return;
    const pending = sessionsRef.current.filter((s) => s.pending && !deletedRef.current.has(s.id));
    if (!pending.length) return;
    const batch = pending.slice(0, 100).map((s) => ({ ...s, pending: undefined }));
    try {
      await api.postSessions(upper, {
        deviceId: deviceRef.current.id,
        token: current.token,
        sessions: batch,
      });
      const sent = new Set(batch.map((s) => s.id));
      setSessionsBoth((prev) => prev.map((s) => (sent.has(s.id) ? { ...s, pending: false } : s)));
      persist();
    } catch {
      /* retried on the next poll */
    }
  }, [persist, setSessionsBoth, upper]);

  const addSession = useCallback(
    (session: Session) => {
      if (deletedRef.current.has(session.id)) return;
      if (sessionsRef.current.some((s) => s.id === session.id)) return;
      const next = [...sessionsRef.current, { ...session, pending: true }].sort((a, b) => a.startedAt - b.startedAt);
      sessionsRef.current = next;
      setSessions(next);
      persist();
      void uploadPending();
    },
    [persist, uploadPending],
  );

  /**
   * The room code is the only key, so a device that lost its membership row
   * (fresh database, token rotation) simply joins again instead of surfacing
   * an error nobody can act on.
   */
  const rejoin = useCallback(async () => {
    if (fatalRef.current) return;
    if (Date.now() - rejoinAt.current < REJOIN_COOLDOWN) return;
    rejoinAt.current = Date.now();
    const device = deviceRef.current;
    try {
      const bootstrap = await api.join(upper, { deviceId: device.id, deviceName: device.name });
      const entry = rememberRoom({
        code: bootstrap.room.code,
        token: bootstrap.token,
        name: bootstrap.room.name,
        deviceName: device.name,
        joinedAt: Date.now(),
      });
      memberRef.current = entry;
      setMember(entry);
      metaRef.current = bootstrap.room;
      setMeta(bootstrap.room);
      if (bootstrap.revision > revisionRef.current) applyDoc(bootstrap.doc, bootstrap.revision);
      setStatus('live');
      setError(null);
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.status === 404) {
        fatalRef.current = 'room_not_found';
        forgetRoom(upper);
        setStatus('error');
        setError('room_not_found');
      }
    }
  }, [applyDoc, upper]);

  /* ---------------------------------------------------------------- */
  /* Timer completion — any online device can settle it, ids dedupe     */
  /* ---------------------------------------------------------------- */

  const complete = useCallback(
    (reason: 'natural' | 'manual', logPartial: boolean) => {
      const current = docRef.current;
      const tz = metaRef.current.tz;
      const startedAt = current.startedAt || Date.now();
      const finishedAt = Math.min(serverNow(), current.running ? current.endsAt : serverNow());
      const planned = durationOf(current, current.mode);
      const elapsed = Math.max(0, finishedAt - startedAt);
      const full = reason === 'natural' || elapsed >= planned * 0.9;
      const minutes = full ? Math.round(planned / 60000) : Math.max(1, Math.round(elapsed / 60000));

      if (logPartial && (full || elapsed >= 60000)) {
        const task = current.tasks.find((t) => t.id === current.activeTaskId) ?? null;
        addSession({
          id: `s:${upper}:${startedAt}`,
          day: dayKey(finishedAt, tz),
          kind: current.mode,
          startedAt,
          endedAt: finishedAt,
          minutes,
          taskId: task?.id ?? null,
          taskLabel: task?.text ?? null,
          deviceId: deviceRef.current.id,
          memberName: deviceRef.current.name,
        });
      }

      // Skipping a focus session is an escape hatch, not the interval-th round,
    // so it hands out a short break rather than a long one.
    const mode = reason === 'manual' && current.mode === 'focus' ? 'short' : nextMode(current);
      const cycle = current.mode === 'focus' && reason === 'natural' ? current.cycle + 1 : current.cycle;
      const autoStart = reason === 'natural' ? (mode === 'focus' ? prefsRef.current.autoStartFocus : prefsRef.current.autoStartBreaks) : false;
      const duration = durationOf({ ...current, cycle }, mode);

      mutateDoc(
        {
          mode,
          cycle,
          running: autoStart,
          startedAt: autoStart ? finishedAt : 0,
          endsAt: autoStart ? finishedAt + duration : 0,
          remainingMs: duration,
          activeTaskId:
            current.activeTaskId && current.tasks.find((t) => t.id === current.activeTaskId)?.done
              ? null
              : current.activeTaskId,
        },
        true,
      );

      if (reason === 'natural') {
        playChime(prefsRef.current.chime, prefsRef.current.volume);
        if (prefsRef.current.notify && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(current.mode === 'focus' ? 'Focus session complete' : 'Break over', {
            body:
              current.mode === 'focus'
                ? `${minutes} minutes logged. Time for a ${mode === 'long' ? 'long' : 'short'} break.`
                : 'Back to focus when you are ready.',
            tag: 'focusflow',
          });
        }
      }
    },
    [addSession, mutateDoc, upper],
  );

  /* Settle a timer that ran out while nobody was watching. */
  const settle = useCallback(() => {
    const current = docRef.current;
    if (!current.running || !current.endsAt) return;
    if (serverNow() < current.endsAt) return;
    const key = `s:${upper}:${current.startedAt}`;
    if (completionGuard.current === key) return;
    completionGuard.current = key;
    if (serverNow() - current.endsAt > STALE_COMPLETION_MS) {
      // Too old to be worth logging — just reset the clock.
      mutateDoc({ running: false, startedAt: 0, endsAt: 0, remainingMs: durationOf(current, current.mode), mode: 'focus' }, true);
      return;
    }
    complete('natural', true);
  }, [complete, mutateDoc, upper]);

  /* ---------------------------------------------------------------- */
  /* Join / bootstrap                                                  */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const device = deviceRef.current;
      try {
        const stored = membership(upper);
        if (stored) {
          memberRef.current = stored;
          setMember(stored);
          const boot = await api.meta(upper);
          if (!alive) return;
          setMeta(boot.room);
          metaRef.current = boot.room;
          setMembers(boot.members);
          membersRef.current = boot.members;
          setStatus('live');
          setLastSyncAt(Date.now());
          return;
        }
        const bootstrap = await api.join(upper, { deviceId: device.id, deviceName: device.name });
        if (!alive) return;
        const entry = rememberRoom({
          code: bootstrap.room.code,
          token: bootstrap.token,
          name: bootstrap.room.name,
          deviceName: device.name,
          joinedAt: Date.now(),
        });
        memberRef.current = entry;
        setMember(entry);
        revisionRef.current = bootstrap.revision;
        sessCursorRef.current = bootstrap.sessCursor;
        tombCursorRef.current = bootstrap.tombCursor;
        metaRef.current = bootstrap.room;
        setMeta(bootstrap.room);
        applyDoc(bootstrap.doc, bootstrap.revision);
        const merged = bootstrap.sessions.filter((s) => !deletedRef.current.has(s.id));
        sessionsRef.current = merged;
        setSessions(merged);
        membersRef.current = bootstrap.members;
        setMembers(bootstrap.members);
        setStatus('live');
        setLastSyncAt(Date.now());
        persist();
      } catch (err) {
        if (!alive) return;
        const apiErr = err as ApiError;
        if (apiErr.status === 404) {
          // The room is gone (or was never there): stop polling and offer a way out.
          fatalRef.current = 'room_not_found';
          forgetRoom(upper);
          setStatus('error');
          setError('room_not_found');
          return;
        }
        setStatus(apiErr.offline ? 'offline' : 'error');
        setError(apiErr.offline ? null : apiErr.code);
        // A device that lost its membership row rejoins with the same identity.
        if (apiErr.status === 403) void rejoin();
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [applyDoc, persist, rejoin, upper]);

  /* Once we are a member, mark the room as most recently visited. */
  useEffect(() => {
    if (member) touchRoom(upper);
  }, [member, upper]);

  /* ---------------------------------------------------------------- */
  /* Poll loop                                                         */
  /* ---------------------------------------------------------------- */

  const syncOnce = useCallback(
    async (force = false) => {
      if (fatalRef.current) return;
      const current = memberRef.current;
      if (!current || inFlight.current) {
        // A push is in flight; try again on the next tick.
        return;
      }
      const activeDoc = docRef.current;
      const activeTask = activeDoc.tasks.find((t) => t.id === activeDoc.activeTaskId);
      const statusPayload = {
        mode: activeDoc.mode,
        running: activeDoc.running,
        endsAt: activeDoc.running ? activeDoc.endsAt : 0,
        remainingMs: activeDoc.running ? activeDoc.endsAt - activeDoc.startedAt : activeDoc.remainingMs,
        task: activeTask?.text ?? '',
      };
      try {
        const result = await api.sync(upper, {
          deviceId: deviceRef.current.id,
          token: current.token,
          deviceName: deviceRef.current.name,
          rev: revisionRef.current,
          sessCursor: sessCursorRef.current,
          tombCursor: tombCursorRef.current,
          status: statusPayload,
          force,
        });
        failureRef.current = 0;
        setStatus('live');
        setError(null);
        setLastSyncAt(Date.now());

        if (result.doc) applyDoc(result.doc, result.revision);
        else revisionRef.current = result.revision;

        const roomMeta = result.room;
        if (roomMeta && (roomMeta.name !== metaRef.current.name || roomMeta.tz !== metaRef.current.tz)) {
          metaRef.current = roomMeta;
          setMeta(roomMeta);
        }

        if (result.sessions.length || result.tombstones.length) {
          const removed = new Set(result.tombstones);
          if (removed.size) rememberDeleted(upper, [...removed]);
          removed.forEach((id) => deletedRef.current.add(id));
          setSessions((prev) => {
            const map = new Map(prev.map((s) => [s.id, s]));
            removed.forEach((id) => map.delete(id));
            for (const incoming of result.sessions) {
              if (removed.has(incoming.id)) continue;
              const existing = map.get(incoming.id);
              map.set(incoming.id, { ...existing, ...incoming, pending: false });
            }
            const next = [...map.values()].sort((a, b) => a.startedAt - b.startedAt);
            sessionsRef.current = next;
            return next;
          });
        }

        sessCursorRef.current = result.sessCursor;
        tombCursorRef.current = result.tombCursor;
        membersRef.current = result.members;
        setMembers(result.members);
        persist();

        if (pendingPush.current) void pushNow();
        void uploadPending();
        settle();
      } catch (err) {
        const apiErr = err as ApiError;
        failureRef.current += 1;
        if (apiErr.status === 404) {
          fatalRef.current = 'room_not_found';
          forgetRoom(upper);
          setStatus('error');
          setError('room_not_found');
          return;
        }
        if (apiErr.status === 403) {
          setStatus('connecting');
          failureRef.current = 0;
          void rejoin();
          return;
        }
        setStatus(apiErr.offline ? 'offline' : 'error');
        if (!apiErr.offline) setError(apiErr.code);
      }
    },
    [applyDoc, persist, pushNow, rejoin, settle, upper, uploadPending],
  );

  useEffect(() => {
    if (!member) return;
    let cancelled = false;
    let timer: number | null = null;

    const tick = async () => {
      if (cancelled || fatalRef.current) return;
      const hidden = typeof document !== 'undefined' && document.hidden;
      const backoff = Math.min(8000, POLL_LIVE * 2 ** Math.min(failureRef.current, 3));
      const delay = failureRef.current ? backoff : hidden ? POLL_HIDDEN : POLL_LIVE;
      await syncOnce(false);
      if (cancelled || fatalRef.current) return;
      timer = window.setTimeout(() => void tick(), delay);
    };

    void syncOnce(true);
    timer = window.setTimeout(() => void tick(), POLL_LIVE);

    const onVisible = () => {
      if (!document.hidden) {
        if (timer !== null) window.clearTimeout(timer);
        void syncOnce(true).then(() => {
          if (!cancelled) timer = window.setTimeout(() => void tick(), POLL_LIVE);
        });
      }
    };
    const onOnline = () => {
      failureRef.current = 0;
      void syncOnce(true);
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', () => setStatus('offline'));

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [member, syncOnce]);

  /* Flush anything still queued when the page goes away. */
  useEffect(() => {
    const flush = () => {
      if (pendingPush.current) void pushNow();
      void uploadPending();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flush();
    });
    return () => window.removeEventListener('pagehide', flush);
  }, [pushNow, uploadPending]);

  /* A local heartbeat keeps the countdown smooth between syncs. */
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(serverNow());
      settle();
    }, 250);
    return () => window.clearInterval(id);
  }, [settle]);

  /* Re-render on the minute so "today" rolls over at the room's midnight. */
  useEffect(() => {
    const id = window.setInterval(persist, 15000);
    return () => window.clearInterval(id);
  }, [persist]);

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  const applyPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      prefsRef.current = next;
      savePrefs(next);
      if (patch.chime && patch.chime !== 'off') playChime(patch.chime, next.volume);
      return next;
    });
  }, []);

  const start = useCallback(() => {
    const current = docRef.current;
    if (current.running) return;
    const duration = durationOf(current, current.mode);
    const remaining = current.remainingMs > 0 && current.remainingMs <= duration ? current.remainingMs : duration;
    const startedAt = serverNow();
    mutateDoc({ running: true, startedAt: startedAt - (duration - remaining), endsAt: startedAt + remaining, remainingMs: remaining }, true);
    void playTick(prefsRef.current.volume);
  }, [mutateDoc]);

  const pause = useCallback(() => {
    const current = docRef.current;
    if (!current.running) return;
    const remaining = Math.max(0, current.endsAt - serverNow());
    mutateDoc({ running: false, remainingMs: remaining, startedAt: 0, endsAt: 0 }, true);
  }, [mutateDoc]);

  const reset = useCallback(() => {
    const current = docRef.current;
    mutateDoc(
      { running: false, startedAt: 0, endsAt: 0, remainingMs: durationOf(current, current.mode) },
      true,
    );
  }, [mutateDoc]);

  const skip = useCallback(() => {
    const current = docRef.current;
    if (current.mode === 'focus' && current.running) {
      complete('manual', true);
      return;
    }
    const mode = nextMode(current);
    const duration = durationOf(current, mode);
    mutateDoc(
      {
        mode,
        cycle: current.mode === 'focus' ? current.cycle + 1 : current.cycle,
        running: false,
        startedAt: 0,
        endsAt: 0,
        remainingMs: duration,
      },
      true,
    );
  }, [complete, mutateDoc]);

  const finishNow = useCallback(() => {
    const current = docRef.current;
    if (current.running && current.mode === 'focus') {
      completionGuard.current = `s:${upper}:${current.startedAt}`;
      complete('natural', true);
      return;
    }
    reset();
  }, [complete, reset, upper]);

  const setMode = useCallback(
    (mode: Mode) => {
      const current = docRef.current;
      const duration = durationOf(current, mode);
      mutateDoc({ mode, running: false, startedAt: 0, endsAt: 0, remainingMs: duration }, true);
    },
    [mutateDoc],
  );

  const patchDoc = useCallback((patch: Partial<RoomDoc>) => mutateDoc(patch), [mutateDoc]);

  const setTimer = useCallback(
    (patch: Partial<TimerSettings>) => {
      const current = docRef.current;
      const timer = { ...current.timer, ...patch };
      const duration = Math.max(60_000, modeMinutes(timer, current.mode) * 60000);
      const next: Partial<RoomDoc> = { timer };
      if (!current.running) next.remainingMs = duration;
      mutateDoc(next);
    },
    [mutateDoc],
  );

  const addTask = useCallback(
    (text: string, est: number) => {
      const current = docRef.current;
      const task = {
        id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        text: text.trim().slice(0, 120),
        est: Math.max(1, Math.min(99, Math.round(est) || 1)),
        done: false,
        createdBy: deviceRef.current.name,
        createdAt: Date.now(),
      };
      if (!task.text) return;
      mutateDoc({ tasks: [...current.tasks, task], activeTaskId: current.activeTaskId ?? task.id }, true);
    },
    [mutateDoc],
  );

  const updateTask = useCallback(
    (id: string, patch: { text?: string; est?: number; done?: boolean }) => {
      const current = docRef.current;
      mutateDoc({
        tasks: current.tasks.map((t) => (t.id === id ? { ...t, ...patch, est: patch.est ? Math.max(1, Math.min(99, patch.est)) : t.est } : t)),
      });
    },
    [mutateDoc],
  );

  const removeTask = useCallback(
    (id: string) => {
      const current = docRef.current;
      mutateDoc({
        tasks: current.tasks.filter((t) => t.id !== id),
        activeTaskId: current.activeTaskId === id ? null : current.activeTaskId,
      });
    },
    [mutateDoc],
  );

  const selectTask = useCallback(
    (id: string | null) => mutateDoc({ activeTaskId: docRef.current.activeTaskId === id ? null : id }, true),
    [mutateDoc],
  );

  const clearCompletedTasks = useCallback(() => {
    const current = docRef.current;
    const remaining = current.tasks.filter((t) => !t.done);
    mutateDoc({
      tasks: remaining,
      activeTaskId: remaining.some((t) => t.id === current.activeTaskId) ? current.activeTaskId : null,
    }, true);
  }, [mutateDoc]);

  const deleteSessions = useCallback(
    async (input: { day?: string; ids?: string[]; all?: boolean }) => {
      const current = memberRef.current;
      if (!current) return;
      const targets = sessionsRef.current
        .filter((s) => (input.all ? true : input.ids ? input.ids.includes(s.id) : input.day ? s.day === input.day : false))
        .map((s) => s.id);
      if (!targets.length) return;
      rememberDeleted(upper, targets);
      targets.forEach((id) => deletedRef.current.add(id));
      setSessionsBoth((prev) => prev.filter((s) => !targets.includes(s.id)));
      persist();
      try {
        await api.deleteSessions(upper, { deviceId: deviceRef.current.id, token: current.token, ...input });
      } catch {
        /* the optimistic removal stands; the next sync will reconcile */
      }
    },
    [persist, setSessionsBoth, upper],
  );

  const renameRoom = useCallback(
    async (name: string) => {
      const current = memberRef.current;
      if (!current) return;
      const next = { ...metaRef.current, name };
      metaRef.current = next;
      setMeta(next);
      persist();
      await api.patchRoom(upper, { deviceId: deviceRef.current.id, token: current.token, name });
    },
    [persist, upper],
  );

  const setRoomTz = useCallback(
    async (tz: string) => {
      const current = memberRef.current;
      if (!current) return;
      const next = { ...metaRef.current, tz };
      metaRef.current = next;
      setMeta(next);
      persist();
      await api.patchRoom(upper, { deviceId: deviceRef.current.id, token: current.token, tz });
    },
    [persist, upper],
  );

  const renameDevice = useCallback((name: string) => {
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed) return;
    const next = { ...deviceRef.current, name: trimmed };
    deviceRef.current = next;
    try {
      localStorage.setItem('focusflow:device:v2', JSON.stringify(next));
    } catch {
      /* ignore */
    }
    const current = memberRef.current;
    if (current) {
      const entry = { ...current, deviceName: trimmed };
      memberRef.current = entry;
      rememberRoom(entry);
      setMember(entry);
    }
  }, []);

  const leaveRoom = useCallback(async () => {
    const current = memberRef.current;
    if (!current) return;
    try {
      await api.leave(upper, { deviceId: deviceRef.current.id, token: current.token });
    } catch {
      /* leaving locally is what matters */
    }
  }, [upper]);

  /* Burn the room on the server, then forget it locally. Every other device is
   * kicked out by its own sync loop; this device navigates home itself. */
  const destroyRoom = useCallback(async () => {
    const current = memberRef.current;
    if (!current) return false;
    try {
      await api.destroyRoom(upper, { deviceId: deviceRef.current.id, token: current.token });
    } catch {
      return false;
    }
    fatalRef.current = 'room_destroyed';
    forgetRoom(upper);
    setError('room_destroyed');
    return true;
  }, [upper]);

  const refresh = useCallback((force = true) => void syncOnce(force), [syncOnce]);

  /* ---------------------------------------------------------------- */
  /* Derived values                                                    */
  /* ---------------------------------------------------------------- */

  const modeDuration = durationOf(doc, doc.mode);
  const remaining = doc.running ? Math.max(0, doc.endsAt - now) : Math.max(0, doc.remainingMs);
  const progress = Math.min(1, Math.max(0, 1 - remaining / modeDuration));
  const onlineIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of members) if (now - m.lastSeen < ONLINE_WINDOW) ids.add(m.deviceId);
    return ids;
  }, [members, now]);

  const value: RoomValue = {
    code: upper,
    meta,
    doc,
    sessions,
    members,
    onlineIds,
    status,
    error,
    lastSyncAt,
    now,
    remaining,
    modeDuration,
    progress,
    me: { deviceId: deviceRef.current.id, name: deviceRef.current.name, token: member?.token ?? '' },
    prefs,
    setPrefs: applyPrefs,
    start,
    pause,
    reset,
    skip,
    finishNow,
    setMode,
    patchDoc,
    setTimer,
    addTask,
    updateTask,
    removeTask,
    selectTask,
    clearCompletedTasks,
    deleteSessions,
    renameRoom,
    setRoomTz,
    renameDevice,
    leaveRoom,
    destroyRoom,
    refresh,
  };

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomValue {
  const value = useContext(RoomContext);
  if (!value) throw new Error('useRoom must be used inside a RoomProvider');
  return value;
}
