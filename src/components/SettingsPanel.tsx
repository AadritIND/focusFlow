import { useEffect, useState } from 'react';
import { useRoom } from '../state/room';
import { CITIES, browserTz, fmtTime, isValidTz, offsetLabel, searchCities, todayKey } from '../lib/time';
import type { Ambient, Chime } from '../lib/types';
import { ConfirmDialog, Field, Modal, NumberRow, RangeRow, Segmented, SwitchRow, useToast } from './ui';

const CHIMES: { value: Chime; label: string }[] = [
  { value: 'off', label: 'Silent' },
  { value: 'bell', label: 'Soft bell' },
  { value: 'triad', label: 'Crystal triad' },
  { value: 'glass', label: 'Glass tap' },
];

const AMBIENCE: { value: Ambient; label: string }[] = [
  { value: 'off', label: 'Silent' },
  { value: 'brown', label: 'Brown noise' },
  { value: 'rain', label: 'Rain' },
  { value: 'cafe', label: 'Room hum' },
];

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const room = useRoom();
  const toast = useToast();
  const [name, setName] = useState(room.meta.name);
  const [tzQuery, setTzQuery] = useState('');
  const [confirm, setConfirm] = useState<'today' | 'all' | null>(null);

  useEffect(() => {
    if (open) setName(room.meta.name);
  }, [open, room.meta.name]);

  if (!open) return null;

  const zones = searchCities(tzQuery).slice(0, 12);

  return (
    <>
      <Modal
        title="Settings"
        subtitle="Timer rules are shared with the room. Sound, theme and alerts stay on this device."
        onClose={onClose}
        wide
        footer={
          <>
            <span className="tiny muted">
              Room created {new Date(room.meta.createdAt).toLocaleDateString()} · {room.meta.tz} ({offsetLabel(room.meta.tz)})
            </span>
            <span className="row" style={{ gap: 8 }}>
              <button
                className="btn sm quiet danger"
                disabled={!room.sessions.length}
                onClick={() => setConfirm('today')}
              >
                Reset today
              </button>
              <button className="btn sm quiet danger" disabled={!room.sessions.length} onClick={() => setConfirm('all')}>
                Clear all history
              </button>
            </span>
          </>
        }
      >
        <p className="label">The room</p>
        <div className="settings-grid" style={{ marginTop: 8 }}>
          <Field label="Room name">
            <input
              className="field"
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => {
                const trimmed = name.trim();
                if (trimmed && trimmed !== room.meta.name) {
                  void room.renameRoom(trimmed);
                  toast('Room renamed');
                } else {
                  setName(room.meta.name);
                }
              }}
            />
          </Field>
          <Field label="Room code" hint="Share it to let another device join this same timer.">
            <input className="field num" value={room.code} readOnly onFocus={(event) => event.target.select()} />
          </Field>
        </div>

        <div className="setting">
          <span>
            <span className="name">Timezone for days and history</span>
            <span className="desc" style={{ display: 'block' }}>
              Right now it is {fmtTime(room.now, room.meta.tz, room.prefs.hour24)} there. Days roll over on this clock.
            </span>
          </span>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <button
            className="btn sm"
            onClick={() => {
              void room.setRoomTz(browserTz());
              toast(`Room follows your timezone: ${browserTz()}`);
            }}
          >
            Use my timezone ({browserTz()})
          </button>
          <span className="small muted">
            Current: <span className="num">{room.meta.tz}</span>
          </span>
        </div>
        <input
          className="field"
          placeholder="Search a city to switch the room's clock…"
          value={tzQuery}
          onChange={(event) => setTzQuery(event.target.value)}
        />
        {tzQuery ? (
          <div style={{ marginTop: 8, maxHeight: 190, overflowY: 'auto' }}>
            {zones.map((city) => (
              <button
                key={city.tz}
                className="row between"
                style={{ width: '100%', padding: '7px 4px', borderBottom: '1px solid var(--hairline)' }}
                onClick={() => {
                  void room.setRoomTz(city.tz);
                  setTzQuery('');
                  toast(`Room clock set to ${city.city}`);
                }}
              >
                <span style={{ fontSize: 14 }}>
                  {city.city} <span className="tiny muted">{city.country}</span>
                </span>
                <span className="tiny muted num">{fmtTime(room.now, city.tz, room.prefs.hour24, false)}</span>
              </button>
            ))}
            {zones.length === 0 && isValidTz(tzQuery) ? (
              <button
                className="btn sm"
                onClick={() => {
                  void room.setRoomTz(tzQuery);
                  setTzQuery('');
                }}
              >
                Use zone {tzQuery}
              </button>
            ) : null}
            {zones.length === 0 && !isValidTz(tzQuery) ? <p className="tiny muted">No match. Try a city name.</p> : null}
          </div>
        ) : null}

        <p className="label" style={{ margin: '24px 0 6px' }}>
          Session rhythm <span className="muted">· shared</span>
        </p>
        <div className="settings-grid">
          <NumberRow
            label="Focus session"
            value={room.doc.timer.work}
            min={1}
            max={180}
            onChange={(value) => room.setTimer({ work: value })}
          />
          <NumberRow
            label="Short break"
            value={room.doc.timer.short}
            min={1}
            max={60}
            onChange={(value) => room.setTimer({ short: value })}
          />
          <NumberRow
            label="Long break"
            value={room.doc.timer.long}
            min={1}
            max={120}
            onChange={(value) => room.setTimer({ long: value })}
          />
          <NumberRow
            label="Focus rounds before a long break"
            value={room.doc.timer.interval}
            min={1}
            max={24}
            suffix="rounds"
            onChange={(value) => room.setTimer({ interval: value })}
          />
          <NumberRow
            label="Daily focus goal"
            value={room.doc.timer.goal}
            min={1}
            max={99}
            suffix="sessions"
            onChange={(value) => room.setTimer({ goal: value })}
          />
        </div>

        <p className="label" style={{ margin: '24px 0 6px' }}>
          This device
        </p>
        <div className="setting">
          <span>
            <span className="name">Device name</span>
            <span className="desc">Shown to everyone else in the room.</span>
          </span>
          <input
            className="field sm"
            style={{ width: 170 }}
            value={room.me.name}
            maxLength={40}
            onChange={(event) => room.renameDevice(event.target.value)}
          />
        </div>
        <SwitchRow
          label="Auto-start breaks"
          desc="The room rolls straight into a break when focus ends."
          checked={room.prefs.autoStartBreaks}
          onChange={(checked) => room.setPrefs({ autoStartBreaks: checked })}
        />
        <SwitchRow
          label="Auto-start focus"
          desc="Breaks roll back into focus on their own."
          checked={room.prefs.autoStartFocus}
          onChange={(checked) => room.setPrefs({ autoStartFocus: checked })}
        />
        <SwitchRow
          label="Desktop notifications"
          desc="A nudge when a session ends and this tab is in the background."
          checked={room.prefs.notify}
          onChange={async (checked) => {
            if (!checked) {
              room.setPrefs({ notify: false });
              return;
            }
            if (typeof Notification === 'undefined') {
              toast('Notifications are not supported here');
              return;
            }
            const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
            if (permission === 'granted') {
              room.setPrefs({ notify: true });
              toast('Notifications on');
            } else {
              toast('Notification permission denied');
            }
          }}
        />
        <SwitchRow
          label="Keep the screen awake while running"
          desc="Uses the screen wake lock where the browser supports it."
          checked={room.prefs.keepAwake}
          onChange={(checked) => room.setPrefs({ keepAwake: checked })}
        />
        <SwitchRow
          label="Reduce motion"
          desc="Turns off the softer transitions."
          checked={room.prefs.reduceMotion}
          onChange={(checked) => room.setPrefs({ reduceMotion: checked })}
        />
        <SwitchRow
          label="24-hour clock"
          checked={room.prefs.hour24}
          onChange={(checked) => room.setPrefs({ hour24: checked })}
        />
        <SwitchRow
          label="Show seconds in the header clock"
          checked={room.prefs.headerSeconds}
          onChange={(checked) => room.setPrefs({ headerSeconds: checked })}
        />

        <p className="label" style={{ margin: '24px 0 6px' }}>
          Sound
        </p>
        <div className="setting">
          <span className="name">Chime at the end of a session</span>
          <Segmented
            value={room.prefs.chime}
            options={CHIMES.map((c) => ({ value: c.value, label: c.label }))}
            onChange={(value) => room.setPrefs({ chime: value })}
            label="Chime"
          />
        </div>
        <RangeRow label="Chime volume" value={room.prefs.volume} onChange={(value) => room.setPrefs({ volume: value })} />
        <div className="setting">
          <span className="name">Background sound</span>
          <Segmented
            value={room.prefs.ambient}
            options={AMBIENCE.map((a) => ({ value: a.value, label: a.label }))}
            onChange={(value) => room.setPrefs({ ambient: value })}
            label="Ambience"
          />
        </div>
        <RangeRow
          label="Background volume"
          value={room.prefs.ambientVolume}
          onChange={(value) => room.setPrefs({ ambientVolume: value })}
        />

        <p className="label" style={{ margin: '24px 0 6px' }}>
          Appearance
        </p>
        <div className="setting">
          <span className="name">Theme</span>
          <Segmented
            value={room.prefs.theme}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ]}
            onChange={(value) => room.setPrefs({ theme: value })}
            label="Theme"
          />
        </div>

        <p className="label" style={{ margin: '24px 0 6px' }}>
          Keyboard
        </p>
        <div className="row wrap" style={{ gap: 8 }}>
          {[
            ['Space', 'start / pause'],
            ['R', 'reset'],
            ['N', 'next session'],
            ['1 2 3', 'focus / short / long'],
            ['H', 'history'],
            ['C', 'world clock'],
            ['S', 'settings'],
            ['T', 'theme'],
          ].map(([key, action]) => (
            <span className="chip" key={key}>
              <span className="num" style={{ fontWeight: 600 }}>
                {key}
              </span>
              <span className="muted">{action}</span>
            </span>
          ))}
        </div>
        <p className="tiny muted" style={{ marginTop: 10 }}>
          {CITIES.length} cities are available in the world clock. Everything you see here synced live with{' '}
          {room.members.length} {room.members.length === 1 ? 'device' : 'devices'} in this room.
        </p>
      </Modal>

      {confirm ? (
        <ConfirmDialog
          title={confirm === 'today' ? "Delete today's sessions?" : 'Clear the whole room history?'}
          body={
            confirm === 'today'
              ? 'Today starts from zero on every device in the room.'
              : 'Every session ever logged in this room is removed for everyone. Tasks and settings stay.'
          }
          confirmLabel={confirm === 'today' ? 'Reset today' : 'Clear all'}
          onClose={() => setConfirm(null)}
          onConfirm={() =>
            void room.deleteSessions(confirm === 'today' ? { day: todayKey(room.meta.tz) } : { all: true })
          }
        />
      ) : null}
    </>
  );
}
