import { useEffect, useMemo, useState } from 'react';
import { useRoom } from '../state/room';
import {
  CITIES,
  browserTz,
  cityForTz,
  daylight,
  fmtTime,
  fmtZoneDiff,
  hourInTz,
  offsetLabel,
  searchCities,
  zoneDiffHours,
} from '../lib/time';
import { Globe, Plus, Trash } from './icons';
import { Modal, useToast } from './ui';
import { todayKey } from '../lib/time';

const STORE = 'focusflow:clocks:v2';

function loadZones(): string[] {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return ['America/New_York', 'Europe/London', 'Asia/Tokyo'];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((z) => typeof z === 'string').slice(0, 12) : [];
  } catch {
    return [];
  }
}

function saveZones(zones: string[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(zones));
  } catch {
    /* ignore */
  }
}

const daylightLabel: Record<string, string> = {
  night: 'Night',
  dawn: 'Early',
  day: 'Day',
  dusk: 'Evening',
};

/** Header clock: the room's official time, plus your own. */
export function HeaderClock({ onOpen }: { onOpen: () => void }) {
  const room = useRoom();
  const mine = browserTz();
  const roomTz = room.meta.tz;
  const sameZone = mine === roomTz;

  return (
    <button className="row" style={{ gap: 10 }} onClick={onOpen} title="World clock">
      <span className="bigclock">
        <span className="t num">{fmtTime(room.now, roomTz, room.prefs.hour24, room.prefs.headerSeconds)}</span>
        <span className="tiny muted">{cityForTz(roomTz)?.city ?? roomTz.split('/').pop()?.replace('_', ' ') ?? 'Room'}</span>
      </span>
      {!sameZone ? (
        <span className="chip">
          <Globe size={13} />
          <span className="num">{fmtTime(room.now, mine, room.prefs.hour24, false)}</span>
          <span className="muted tiny">you</span>
        </span>
      ) : (
        <span className="chip muted">your timezone</span>
      )}
    </button>
  );
}

export function WorldClockPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const room = useRoom();
  const toast = useToast();
  const [zones, setZones] = useState<string[]>(loadZones);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) saveZones(zones);
  }, [zones, open]);

  const roomToday = todayKey(room.meta.tz);
  const results = useMemo(() => searchCities(query).slice(0, 40), [query]);
  const mine = browserTz();

  if (!open) return null;

  const add = (tz: string) => {
    if (zones.includes(tz) || tz === room.meta.tz) return;
    setZones((prev) => [...prev, tz].slice(0, 12));
    setQuery('');
    toast(`Added ${cityForTz(tz)?.city ?? tz}`);
  };

  const pinned = [room.meta.tz, mine, ...zones].filter((tz, index, all) => all.indexOf(tz) === index);

  return (
    <Modal
      title="World clock"
      subtitle={`Every day in this room starts and ends on ${room.meta.tz} time — that is what the history uses.`}
      onClose={onClose}
      wide
      footer={
        <span className="small muted">
          Room day: <span className="num">{roomToday}</span> · {offsetLabel(room.meta.tz)}
        </span>
      }
    >
      <div style={{ marginBottom: 18 }}>
        {pinned.map((tz) => {
          const city = cityForTz(tz);
          const diff = zoneDiffHours(tz, room.now);
          const light = daylight(tz, room.now);
          const isRoom = tz === room.meta.tz;
          const isMine = tz === mine && !isRoom;
          return (
            <div className="clock-row" key={tz}>
              <span className={`dot ${light === 'night' ? '' : 'live'}`} title={daylightLabel[light]} />
              <span className="left" style={{ flex: 1, minWidth: 0 }}>
                <span className="row" style={{ gap: 8 }}>
                  <strong style={{ fontWeight: 550, fontSize: 14 }}>{city?.city ?? tz}</strong>
                  {isRoom ? <span className="chip">Room</span> : null}
                  {isMine ? <span className="chip">You</span> : null}
                </span>
                <span className="zone">
                  {city?.country ?? ''} {city ? '·' : ''} {tz} · {offsetLabel(tz, room.now)}
                </span>
              </span>
              <span style={{ textAlign: 'right' }}>
                <span className="time num" style={{ display: 'block', fontSize: 18 }}>
                  {fmtTime(room.now, tz, room.prefs.hour24, false)}
                </span>
                <span className="tiny muted">
                  {hourInTz(room.now, tz) >= 22 || hourInTz(room.now, tz) < 6 ? 'Night' : daylightLabel[light]}
                  {diff !== 0 ? ` · ${fmtZoneDiff(diff)}` : ''}
                </span>
              </span>
              {!isRoom && !isMine ? (
                <button
                  className="icon-btn"
                  onClick={() => setZones((prev) => prev.filter((zone) => zone !== tz))}
                  aria-label={`Remove ${city?.city ?? tz}`}
                >
                  <Trash size={14} />
                </button>
              ) : (
                <span style={{ width: 34 }} />
              )}
            </div>
          );
        })}
      </div>

      <div className="rule" />

      <div style={{ marginTop: 16 }}>
        <div className="row between" style={{ marginBottom: 10 }}>
          <span className="label">Add a city</span>
          <span className="tiny muted">{CITIES.length} cities ready to pin</span>
        </div>
        <input
          className="field"
          placeholder="Search a city, country or zone…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div style={{ maxHeight: 240, overflowY: 'auto', marginTop: 10 }}>
          {results.map((city) => {
            const already = pinned.includes(city.tz);
            return (
              <button
                key={city.tz}
                className="row between"
                style={{ width: '100%', padding: '8px 4px', borderBottom: '1px solid var(--hairline)', textAlign: 'left' }}
                onClick={() => add(city.tz)}
                disabled={already}
              >
                <span>
                  <span style={{ fontSize: 14 }}>{city.city}</span>
                  <span className="tiny muted"> · {city.country}</span>
                </span>
                <span className="row" style={{ gap: 10 }}>
                  <span className="tiny muted num">{fmtTime(room.now, city.tz, room.prefs.hour24, false)}</span>
                  {already ? <span className="tiny muted">pinned</span> : <Plus size={14} />}
                </span>
              </button>
            );
          })}
          {results.length === 0 ? (
            <p className="empty-state">
              No city matched. You can still set the room timezone to any IANA zone from Settings.
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
