import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RoomProvider, useRoom } from '../state/room';
import { Timer } from '../components/Timer';
import { Tasks } from '../components/Tasks';
import { StatsPanel } from '../components/StatsPanel';
import { HistoryPanel } from '../components/HistoryPanel';
import { SettingsPanel } from '../components/SettingsPanel';
import { HeaderClock, WorldClockPanel } from '../components/WorldClock';
import { Devices } from '../components/Devices';
import { StatusPill } from '../components/ui';
import { Gear, History, Mark, Moon, Sun } from '../components/icons';
import { useHotkeys, useWakeLock } from '../lib/hooks';
import { playAmbient, stopAmbient, unlockAudio } from '../lib/audio';
import { useAppliedTheme, useModeBackground } from '../lib/theme';
import { browserTz, cityForTz, fmtCountdown, fmtTime, relativeTime } from '../lib/time';

export function RoomPage() {
  return (
    <RoomProvider code={useParams().code ?? ''}>
      <RoomShell />
    </RoomProvider>
  );
}

function RoomShell() {
  const room = useRoom();
  const [history, setHistory] = useState(false);
  const [settings, setSettings] = useState(false);
  const [clocks, setClocks] = useState(false);
  const [clockListVersion, setClockListVersion] = useState(0);
  const closeClocks = () => {
    setClocks(false);
    setClockListVersion((version) => version + 1);
  };

  useAppliedTheme(room.prefs.theme, room.prefs.reduceMotion);
  useModeBackground(room.doc.mode === 'focus' ? 'work' : room.doc.mode);
  useWakeLock(room.doc.running && room.prefs.keepAwake);

  useHotkeys(
    {
      ' ': () => (room.doc.running ? room.pause() : room.start()),
      r: () => room.reset(),
      n: () => room.skip(),
      '1': () => room.setMode('focus'),
      '2': () => room.setMode('short'),
      '3': () => room.setMode('long'),
      h: () => setHistory(true),
      c: () => setClocks(true),
      s: () => setSettings(true),
      t: () => room.setPrefs({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }),
    },
    !history && !settings && !clocks,
  );

  /* Ambient sound belongs to the room, not the settings dialog. */
  useEffect(() => {
    const handler = () => unlockAudio();
    window.addEventListener('pointerdown', handler, { once: true });
    return () => window.removeEventListener('pointerdown', handler);
  }, []);

  useEffect(() => {
    if (room.prefs.ambient === 'off') {
      stopAmbient();
      return;
    }
    playAmbient(room.prefs.ambient, room.prefs.ambientVolume);
    return () => stopAmbient();
  }, [room.prefs.ambient, room.prefs.ambientVolume]);

  /* A tab title that keeps working while you are in another window. */
  useEffect(() => {
    const label = room.doc.mode === 'focus' ? 'Focus' : room.doc.mode === 'short' ? 'Short break' : 'Long break';
    document.title = room.doc.running
      ? `${fmtCountdown(room.remaining)} · ${label} — FocusFlow`
      : `${label} — ${room.meta.name} · FocusFlow`;
    return () => {
      document.title = 'FocusFlow';
    };
  }, [room.doc.running, room.doc.mode, room.remaining, room.meta.name]);

  const pinnedZones = useMemo(() => {
    const raw = typeof localStorage === 'undefined' ? '[]' : localStorage.getItem('focusflow:clocks:v2') ?? '[]';
    let extra: string[] = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) extra = parsed.filter((z) => typeof z === 'string').slice(0, 3);
    } catch {
      extra = [];
    }
    const mine = browserTz();
    return [mine, ...extra].filter((tz, index, all) => tz !== room.meta.tz && all.indexOf(tz) === index).slice(0, 3);
  }, [room.meta.tz, clockListVersion]);

  if (room.error === 'room_not_found') {
    return (
      <div className="wrap">
        <header className="room-bar">
          <Link to="/" className="brand">
            <span className="mark">
              <Mark size={26} />
            </span>
            FocusFlow
          </Link>
        </header>
        <div className="center-page">
          <div>
            <h1 className="serif" style={{ fontSize: 30, fontWeight: 500 }}>
              That room does not exist
            </h1>
            <p className="lead" style={{ marginTop: 10 }}>
              <span className="num">{room.code}</span> was never created, or it was typed with one letter off.
            </p>
            <div className="row" style={{ gap: 10, marginTop: 18, justifyContent: 'center' }}>
              <Link className="btn primary lg" to="/">
                Create a new room
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (room.status === 'connecting' && !room.lastSyncAt) {
    return (
      <div className="boot">
        <span style={{ color: 'var(--accent)' }}>
          <Mark size={40} />
        </span>
        <p className="label">Joining {room.code}</p>
        <p className="small muted">Fetching the shared timer and history…</p>
      </div>
    );
  }

  const theme = room.prefs.theme;

  return (
    <div className={room.doc.mode === 'focus' ? 'mode-focus' : room.doc.mode === 'short' ? 'mode-short' : 'mode-long'}>
      <header className="room-header">
        <div className="wrap room-bar">
          <Link to="/" className="brand" title="FocusFlow home">
            <span className="mark" style={{ color: 'var(--mode, var(--accent))' }}>
              <Mark size={26} />
            </span>
            <span className="brand-text" style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.15, minWidth: 0 }}>
              <span className="brand-name">{room.meta.name}</span>
              <span className="brand-code tiny muted num">{room.code}</span>
            </span>
          </Link>
          <span className="spacer" />
          <StatusPill status={room.status} detail={`Last sync ${relativeTime(room.lastSyncAt || room.now, room.now)}`} />
          <HeaderClock onOpen={() => setClocks(true)} />
          <button className="icon-btn" onClick={() => setHistory(true)} aria-label="History" title="History (H)">
            <History size={17} />
          </button>
          <button
            className="icon-btn"
            onClick={() => setSettings(true)}
            aria-label="Settings"
            title="Settings (S)"
          >
            <Gear size={17} />
          </button>
          <button
            className="icon-btn"
            onClick={() => room.setPrefs({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' })}
            aria-label="Toggle theme"
            title="Theme (T)"
          >
            {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>
      </header>

      <main className="wrap room-grid">
        <div className="column">
          <Timer />
          <Tasks />
        </div>

        <div className="column">
          <StatsPanel onOpenHistory={() => setHistory(true)} />

          <section className="panel" aria-label="Clocks">
            <div className="panel-head">
              <span className="label">Clocks</span>
              <button className="btn sm quiet" onClick={() => setClocks(true)}>
                Add city
              </button>
            </div>
            <div className="panel-body" style={{ paddingTop: 8 }}>
              <div className="clock-row">
                <span className="dot live" />
                <span style={{ flex: 1 }}>
                  <span className="row" style={{ gap: 8 }}>
                    <strong style={{ fontWeight: 550, fontSize: 14 }}>
                      {cityForTz(room.meta.tz)?.city ?? room.meta.tz}
                    </strong>
                    <span className="chip">Room</span>
                  </span>
                  <span className="tiny muted">{room.meta.tz}</span>
                </span>
                <span className="num" style={{ fontSize: 17 }}>
                  {fmtTime(room.now, room.meta.tz, room.prefs.hour24, room.prefs.headerSeconds)}
                </span>
              </div>
              {pinnedZones.map((tz) => (
                <div className="clock-row" key={tz}>
                  <span className="dot" />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontWeight: 550, fontSize: 14 }}>{cityForTz(tz)?.city ?? tz}</strong>
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {tz}
                    </span>
                  </span>
                  <span className="num" style={{ fontSize: 17 }}>
                    {fmtTime(room.now, tz, room.prefs.hour24, false)}
                  </span>
                </div>
              ))}
              <p className="tiny muted" style={{ marginTop: 10 }}>
                Days in this room roll over at midnight in {room.meta.tz}.
              </p>
            </div>
          </section>

          <Devices />

          <section className="panel" aria-label="Shortcuts">
            <div className="panel-body">
              <p className="label" style={{ marginBottom: 8 }}>
                Shortcuts
              </p>
              <div className="row wrap" style={{ gap: 8 }}>
                {(
                  [
                    ['Space', 'start / pause'],
                    ['R', 'reset'],
                    ['N', 'next'],
                    ['1 2 3', 'sessions'],
                    ['H', 'history'],
                    ['C', 'clocks'],
                  ] as [string, string][]
                ).map(([key, action]) => (
                  <span className="chip" key={key}>
                    <span className="num" style={{ fontWeight: 600 }}>
                      {key}
                    </span>
                    <span className="muted">{action}</span>
                  </span>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>

      {history ? <HistoryPanel open onClose={() => setHistory(false)} /> : null}
      {settings ? <SettingsPanel open onClose={() => setSettings(false)} /> : null}
      {clocks ? <WorldClockPanel open onClose={closeClocks} /> : null}
    </div>
  );
}
