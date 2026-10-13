import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { createRoom } from '../lib/rooms';
import { rememberedRooms } from '../lib/device';
import { useModeBackground, useTheme } from '../lib/theme';
import {
  CITIES,
  browserTz,
  cityForTz,
  daylight,
  fmtCountdown,
  fmtTime,
  offsetLabel,
  zoneLabel,
} from '../lib/time';
import type { GlobalStats } from '../lib/types';
import { Ring, Modal, Segmented, useToast } from '../components/ui';
import { Bolt, Globe, Mark, Moon, People, Play, Pause, Sun, History, Calendar } from '../components/icons';

export function LandingPage() {
  useModeBackground('home');
  const navigate = useNavigate();
  const toast = useToast();
  const { dark, setTheme } = useTheme();
  const remembered = useMemo(() => rememberedRooms(), []);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [stay, setStay] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    api
      .stats()
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  /* A device that is already in a room goes straight back to it. */
  useEffect(() => {
    if (!remembered.length || stay) return;
    const id = window.setTimeout(() => navigate(`/r/${remembered[0].code}`, { replace: true }), 800);
    return () => window.clearTimeout(id);
  }, [remembered, stay, navigate]);

  const hours = stats ? Math.round(stats.focusSessions * 25 / 60) : 0;

  return (
    <div>
      <header className="site-header">
        <div className="wrap site-nav">
          <Link to="/" className="brand">
            <span className="mark" style={{ color: 'var(--accent)' }}>
              <Mark size={26} />
            </span>
            FocusFlow
          </Link>
          <nav>
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#clocks">Clocks</a>
            <a href="#faq">FAQ</a>
          </nav>
          <span className="spacer" />
          <button
            className="icon-btn"
            onClick={() => setTheme(dark ? 'light' : 'dark')}
            aria-label="Toggle theme"
            title={`Switch to ${dark ? 'light' : 'dark'} mode`}
          >
            {dark ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button className="btn" onClick={() => setJoinOpen(true)}>
            Join a room
          </button>
          <button className="btn primary" onClick={() => setCreateOpen(true)}>
            Create a room
          </button>
        </div>
      </header>

      {remembered.length && !stay ? (
        <div style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--hairline)' }}>
          <div className="wrap row between" style={{ padding: '10px 24px', gap: 12, flexWrap: 'wrap' }}>
            <span className="small">
              Taking you back to <strong>{remembered[0].name}</strong>{' '}
              <span className="num muted">{remembered[0].code}</span> — this browser never has to sign in again.
            </span>
            <span className="row" style={{ gap: 8 }}>
              <button className="btn sm" onClick={() => navigate(`/r/${remembered[0].code}`)}>
                Open now
              </button>
              <button className="btn sm quiet" onClick={() => setStay(true)}>
                Stay here
              </button>
            </span>
          </div>
        </div>
      ) : null}

      <main>
        <section className="wrap hero">
          <div>
            <span className="kicker">
              <Bolt size={13} />
              Focus, together
            </span>
            <h1>
              One timer that every device <em>agrees on.</em>
            </h1>
            <p className="lead">
              FocusFlow is a study timer you share instead of repeat. Make a room, send the code, and every phone,
              laptop and tablet in it counts down the same seconds — with the same task, the same breaks, and one
              honest history that starts the moment you walk in.
            </p>
            <div className="hero-actions">
              <button className="btn primary lg" onClick={() => setCreateOpen(true)}>
                Create a room
              </button>
              <button className="btn lg" onClick={() => setJoinOpen(true)}>
                I have a code
              </button>
              <a className="btn lg quiet" href="#how">
                See how it works
              </a>
            </div>

            <div className="stat-strip">
              <div className="item">
                <div className="v num">{stats ? stats.rooms.toLocaleString() : '—'}</div>
                <div className="k">Rooms opened</div>
              </div>
              <div className="item">
                <div className="v num">{stats ? stats.focusSessions.toLocaleString() : '—'}</div>
                <div className="k">Sessions logged</div>
              </div>
              <div className="item">
                <div className="v num">{stats ? `${hours.toLocaleString()}h` : '—'}</div>
                <div className="k">Time focused (est.)</div>
              </div>
              <div className="item">
                <div className="v num">{stats ? stats.members.toLocaleString() : '—'}</div>
                <div className="k">Devices joined</div>
              </div>
              <div className="item">
                <div className="v num">0</div>
                <div className="k">Accounts needed</div>
              </div>
            </div>
          </div>

          <DemoCard />
        </section>

        <section className="section" id="clocks">
          <div className="wrap">
            <div className="section-head">
              <h2>A room keeps its own clock</h2>
              <p className="lead">
                Long-distance study groups fall apart over the small things: whose “today” counts, when a streak
                breaks, what time the session actually ended. A FocusFlow room picks one timezone and uses it for the
                day boundary, the history and the streak — while every member still sees their own local time next to
                it.
              </p>
            </div>
            <ClockStrip />
          </div>
        </section>

        <section className="section" id="how">
          <div className="wrap">
            <div className="section-head">
              <h2>Three steps, and then you never think about it again</h2>
              <p className="lead">
                There is no sign-up, no email, no invite limbo. The room code is the only key the system has, and this
                browser writes it down the first time you use it.
              </p>
            </div>
            <div className="steps">
              <div className="step">
                <div className="n">01</div>
                <h3>Make a room</h3>
                <p>
                  You get a permanent code like <span className="num">AMBER-FOX-73</span>. It is created once and never
                  expires — the room keeps its tasks, history and settings as long as you come back to it.
                </p>
              </div>
              <div className="step">
                <div className="n">02</div>
                <h3>Open it anywhere</h3>
                <p>
                  Type the code on a phone, send the invite link to a friend, add it to a tablet on your desk. Each
                  device joins as itself and shows up in the room’s device list.
                </p>
              </div>
              <div className="step">
                <div className="n">03</div>
                <h3>Press start once</h3>
                <p>
                  Start, pause, switch to a break, change the focus task — every device follows within a second. When a
                  session ends, whoever is online logs it, exactly once.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="features">
          <div className="wrap">
            <div className="section-head">
              <h2>Built for the way studying actually goes</h2>
              <p className="lead">
                The timer is the easy part. What makes a study tool stick is refusing to lose your data when the
                internet drops, or when you forget to press pause before you walk away.
              </p>
            </div>
            <div className="feature-grid">
              <Feature glyph={<People size={18} />} title="Rooms with permanent codes">
                A code that is created once and stays valid forever. No invites to accept, no members to approve — the
                code is the door.
              </Feature>
              <Feature glyph={<Bolt size={18} />} title="Shared, drift-free countdown">
                The end time lives on the server, so devices with skewed clocks still agree on the last second. Pause on
                your phone, the laptop pauses too.
              </Feature>
              <Feature glyph={<History size={18} />} title="History that survives">
                Every finished session is appended with the device that logged it. Nothing is overwritten, so two people
                studying at once can never clobber each other’s totals.
              </Feature>
              <Feature glyph={<Calendar size={18} />} title="Previous days, properly">
                Yesterday and the day before are one glance away, plus a 18-week heatmap, streaks, your sharpest hour
                and a per-task breakdown.
              </Feature>
              <Feature glyph={<Globe size={18} />} title="World clock built in">
                Local time, the room’s timezone and any cities your group spans — with a day/night read on each one.
              </Feature>
              <Feature glyph={<Bolt size={18} />} title="Works offline, then catches up">
                Lose the connection mid-session and the page keeps counting. Sessions queue locally and upload
                themselves the moment you are back.
              </Feature>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="section-head">
              <h2>What a room remembers for you</h2>
              <p className="lead">
                Numbers you can argue with, because they were never rounded or guessed. Breaks are logged separately so
                focus time means focus time, and every session keeps the task label it was worked under.
              </p>
            </div>
            <div className="settings-grid" style={{ gap: 18 }}>
              {[
                ['Today', 'Focus time, session count and how far you are from the daily goal, updated live as the room works.'],
                ['Previous days', 'Yesterday and the day before, then an expandable log of every session with times, tasks and devices.'],
                ['Streaks', 'Current run of days with at least one finished focus session, plus your best run so far.'],
                ['Goal days', 'How many days you actually closed the daily goal — the number people usually care about.'],
                ['Sharpest hour', 'A 24-hour histogram of when your focus minutes land, so you can schedule the hard work.'],
                ['Portable', 'Export the entire room history as CSV whenever you like. It is your data, not a subscription.'],
              ].map(([title, body]) => (
                <div className="tile" key={title}>
                  <strong style={{ fontWeight: 600 }}>{title}</strong>
                  <p className="small muted" style={{ marginTop: 4 }}>
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="faq">
          <div className="wrap">
            <div className="section-head">
              <h2>Questions people actually ask</h2>
              <p className="lead">Short answers, no marketing.</p>
            </div>
            <div>
              {[
                [
                  'Do I need an account?',
                  'No. There is no sign-up, no password and no email. A room code is a shared secret: anyone who has it can join the room, so treat it like a group key rather than a private one.',
                ],
                [
                  'What happens if I close the browser?',
                  'This device stores its membership forever, so the next time you open FocusFlow it drops you straight back into your room with the same identity. Use “Leave room” if you actually want out.',
                ],
                [
                  'Does the timer keep running when nobody is watching?',
                  'Yes. The end time is an absolute moment, not a countdown per device. If the tab is closed when a session ends, the next device that opens the room settles it and logs the session once.',
                ],
                [
                  'What if two of us press pause at the same time?',
                  'The room keeps a single document with a revision number. Writes that are based on an out-of-date revision are rejected and the newer state comes back, so everyone converges within a sync tick.',
                ],
                [
                  'Where is my history stored?',
                  'In the room, on the server, as an append-only log. Devices keep a local copy too, so the page still shows yesterday while you are offline and uploads anything you did once you reconnect.',
                ],
                [
                  'Can I use it for a solo study session?',
                  'That is the most common way to use it — a room of one. You still get the history, streaks and the fact that a phone and a laptop stay in step.',
                ],
              ].map(([question, answer]) => (
                <details className="faq-item" key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer wrap">
        <span>
          FocusFlow — a shared study timer. Built on Cloudflare Workers, D1 and a lot of quiet evenings.
        </span>
        <span className="row" style={{ gap: 14 }}>
          <Link to="/r/AMBER-FOX-73" className="muted">
            What a room link looks like
          </Link>
          <span className="muted">No accounts · No tracking · No noise</span>
        </span>
      </footer>

      {createOpen ? (
        <CreateRoomModal
          onClose={() => setCreateOpen(false)}
          onCreated={(code, name) => {
            toast(`${name} is ready`);
            navigate(`/r/${code}`);
          }}
        />
      ) : null}
      {joinOpen ? <JoinRoomModal onClose={() => setJoinOpen(false)} onJoin={(code) => navigate(`/r/${code}`)} /> : null}
    </div>
  );
}

function Feature({ glyph, title, children }: { glyph: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="feature">
      <span className="glyph">{glyph}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Clock strip                                                         */
/* ------------------------------------------------------------------ */

const STRIP = ['America/Los_Angeles', 'Europe/London', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney'];

function ClockStrip() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const mine = browserTz();

  return (
    <div className="clock-strip">
      <div className="clock-card">
        <span className="label">Your device</span>
        <span className="time num">{fmtTime(now, mine, true, true)}</span>
        <span className="tiny muted">
          {zoneLabel(mine)} · {offsetLabel(mine, now)}
        </span>
      </div>
      {STRIP.filter((tz) => tz !== mine).map((tz) => (
        <div className="clock-card" key={tz}>
          <span className="label">{cityForTz(tz)?.country ?? tz}</span>
          <span className="time num">{fmtTime(now, tz, true, false)}</span>
          <span className="tiny muted">
            {zoneLabel(tz)} · {daylight(tz, now) === 'night' ? 'night' : 'day'}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live demo                                                           */
/* ------------------------------------------------------------------ */

function DemoCard() {
  const [mode, setMode] = useState<'focus' | 'short'>('focus');
  const [running, setRunning] = useState(true);
  const [endsAt, setEndsAt] = useState(() => Date.now() + 25 * 60000);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const duration = (mode === 'focus' ? 25 : 5) * 60000;
  const remaining = running ? Math.max(0, endsAt - now) : duration;
  const progress = 1 - remaining / duration;

  return (
    <div className="demo-shell mode-focus">
      <div className="row between" style={{ marginBottom: 12 }}>
        <span className="chip">
          <span className="dot live" />
          AMBER-FOX-73
        </span>
        <span className="row" style={{ gap: 6 }}>
          <span className="avatar online">LP</span>
          <span className="avatar online">PH</span>
          <span className="avatar">TB</span>
          <span className="tiny muted">3 devices</span>
        </span>
      </div>
      <div className="row" style={{ justifyContent: 'center' }}>
        <Segmented
          value={mode}
          options={[
            { value: 'focus', label: 'Focus 25' },
            { value: 'short', label: 'Break 5' },
          ]}
          onChange={(value) => {
            setMode(value);
            setEndsAt(Date.now() + (value === 'focus' ? 25 : 5) * 60000);
          }}
        />
      </div>
      <div style={{ display: 'grid', placeItems: 'center' }}>
        <Ring progress={progress}>
          <span className="countdown num" style={{ fontSize: 'clamp(44px, 10vw, 64px)' }}>
            {fmtCountdown(remaining)}
          </span>
          <span className="small muted">{mode === 'focus' ? 'Focus' : 'Short break'}</span>
        </Ring>
      </div>
      <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
        <button
          className="btn primary"
          onClick={() => {
            if (running) setRunning(false);
            else {
              setEndsAt(Date.now() + duration);
              setRunning(true);
            }
          }}
        >
          {running ? <Pause size={15} /> : <Play size={15} />}
          {running ? 'Pause everywhere' : 'Start the room'}
        </button>
      </div>
      <p className="tiny muted" style={{ textAlign: 'center', marginTop: 12 }}>
        This is the real component, running solo. In a room the same tap moves every device within a second.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modals                                                             */
/* ------------------------------------------------------------------ */

function CreateRoomModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (code: string, name: string) => void;
}) {
  const [name, setName] = useState('Study room');
  const [tz, setTz] = useState(browserTz());
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement | null>(null);

  useEffect(() => first.current?.focus(), []);
  const results = useMemo(
    () => (query ? CITIES.filter((c) => `${c.city} ${c.country} ${c.tz}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6) : []),
    [query],
  );

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { room } = await createRoom({ roomName: name, tz });
      onCreated(room.code, room.name);
    } catch (err) {
      setError(err instanceof Error && err.message.includes('offline')
        ? 'Could not reach the server. Check your connection and try again.'
        : 'Something went wrong creating the room. Try again in a moment.');
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Create a room"
      subtitle="Permanent code, permanent history, no account."
      onClose={onClose}
      footer={
        <>
          <span className="tiny muted">The room lives on the server, so every device can find it by code.</span>
          <button className="btn primary" onClick={submit} disabled={busy}>
            {busy ? 'Creating…' : 'Create room'}
          </button>
        </>
      }
    >
      <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ flex: '1 1 220px' }}>
          <span className="label">Room name</span>
          <input
            ref={first}
            className="field"
            style={{ marginTop: 6 }}
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit();
            }}
          />
        </label>
      </div>
      <div style={{ marginTop: 16 }}>
        <span className="label">Timezone for days and streaks</span>
        <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          <span className="chip mono">{tz}</span>
          <button className="btn sm" onClick={() => setTz(browserTz())}>
            Use my timezone
          </button>
        </div>
        <input
          className="field"
          style={{ marginTop: 8 }}
          placeholder="Search a city to change it…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {results.map((city) => (
          <button
            key={city.tz}
            className="row between"
            style={{ width: '100%', padding: '8px 4px', borderBottom: '1px solid var(--hairline)' }}
            onClick={() => {
              setTz(city.tz);
              setQuery('');
            }}
          >
            <span>
              {city.city} <span className="tiny muted">{city.country}</span>
            </span>
            <span className="tiny muted num">{fmtTime(Date.now(), city.tz, true, false)}</span>
          </button>
        ))}
      </div>
      {error ? (
        <p className="small" style={{ color: 'var(--danger)', marginTop: 14 }}>
          {error}
        </p>
      ) : null}
      <p className="tiny muted" style={{ marginTop: 16 }}>
        You will land inside the room right away. Everything else — the timer length, the goal, the task list — can be
        changed later and syncs to everyone.
      </p>
    </Modal>
  );
}

function JoinRoomModal({ onClose, onJoin }: { onClose: () => void; onJoin: (code: string) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (normalized.length < 3) {
      setError('Codes look like AMBER-FOX-73.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.meta(normalized);
      onJoin(normalized);
    } catch (err) {
      setBusy(false);
      const status = (err as { status?: number }).status;
      setError(status === 404 ? 'No room with that code. Check the spelling.' : 'Could not reach the server.');
    }
  };

  return (
    <Modal
      title="Join a room"
      subtitle="Paste the code someone sent you."
      onClose={onClose}
      footer={
        <>
          <span className="tiny muted">Joining is instant and permanent on this device.</span>
          <button className="btn primary" onClick={submit} disabled={busy}>
            {busy ? 'Looking…' : 'Join room'}
          </button>
        </>
      }
    >
      <input
        className="field num"
        style={{ fontSize: 22, letterSpacing: '0.08em', textAlign: 'center', padding: '16px 12px' }}
        placeholder="AMBER-FOX-73"
        autoFocus
        value={code}
        onChange={(event) => setCode(event.target.value.toUpperCase())}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void submit();
        }}
      />
      {error ? (
        <p className="small" style={{ color: 'var(--danger)', marginTop: 12 }}>
          {error}
        </p>
      ) : null}
      <p className="tiny muted" style={{ marginTop: 14 }}>
        You can also open the invite link directly — it looks like <span className="num">{`${window.location.origin}/r/AMBER-FOX-73`}</span>.
      </p>
    </Modal>
  );
}
