import { useEffect, useRef, useState } from 'react';
import { useRoom } from '../state/room';
import { fmtCountdown, relativeTime } from '../lib/time';
import { MODE_HINT, MODE_LABEL, modeMinutes, type Mode } from '../lib/types';
import { Ring } from './ui';
import { Bolt, Pause, Pencil, Play, Reset, Skip, Stop } from './icons';

const MODES: Mode[] = ['focus', 'short', 'long'];

export function Timer() {
  const room = useRoom();
  const [editingIntention, setEditingIntention] = useState(false);
  const [draft, setDraft] = useState(room.doc.intention);
  const intentionRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingIntention) intentionRef.current?.focus();
  }, [editingIntention]);

  const activeTask = room.doc.tasks.find((task) => task.id === room.doc.activeTaskId) ?? null;
  const interval = Math.max(1, room.doc.timer.interval);
  const cyclePosition = room.doc.cycle % interval;
  const onlineNow = room.members.filter((m) => room.onlineIds.has(m.deviceId));

  return (
    <section className={`timer-shell mode-${room.doc.mode}`} aria-label="Shared timer">
      <div className="segmented" role="tablist" aria-label="Session type">
        {MODES.map((mode) => (
          <button
            key={mode}
            role="tab"
            aria-selected={room.doc.mode === mode}
            onClick={() => room.setMode(mode)}
            title={`${MODE_LABEL[mode]} — ${modeMinutes(room.doc.timer, mode)} minutes`}
          >
            {MODE_LABEL[mode]}
            <span className="num muted" style={{ marginLeft: 6, fontSize: 12 }}>
              {modeMinutes(room.doc.timer, mode)}
            </span>
          </button>
        ))}
      </div>

      <Ring progress={room.progress}>
        <div className="countdown num" role="timer" aria-live="off">
          {fmtCountdown(room.remaining)}
        </div>
        <div className="small muted">{MODE_LABEL[room.doc.mode]}</div>
      </Ring>

      <div className="row" style={{ gap: 10, marginTop: 6 }} aria-label="Round progress">
        {Array.from({ length: interval }, (_, i) => (
          <span
            key={i}
            className="dot"
            style={{
              width: 6,
              height: 6,
              background: i < cyclePosition ? 'var(--mode, var(--accent))' : 'var(--hairline-2)',
              opacity: i < cyclePosition ? 1 : 0.9,
            }}
            title={`Round ${i + 1} of ${interval}`}
          />
        ))}
        <span className="tiny muted" style={{ marginLeft: 4 }}>
          round {room.doc.mode === 'focus' ? cyclePosition + 1 : Math.max(1, cyclePosition)} of {interval}
        </span>
      </div>

      <div className="timer-controls">
        <button className="btn" onClick={room.reset} title="Reset (R)">
          <Reset size={15} />
          Reset
        </button>
        <button
          className="btn primary lg"
          onClick={() => (room.doc.running ? room.pause() : room.start())}
          title="Start or pause (Space)"
        >
          {room.doc.running ? <Pause size={15} /> : <Play size={15} />}
          {room.doc.running ? 'Pause' : room.remaining < room.modeDuration ? 'Resume' : 'Start'}
        </button>
        <button className="btn" onClick={room.skip} title="Skip to the next session (N)">
          <Skip size={15} />
          Skip
        </button>
      </div>

      <div className="row wrap" style={{ marginTop: 10, justifyContent: 'center', gap: 8 }}>
        {room.doc.running && room.doc.mode === 'focus' ? (
          <button className="btn sm quiet" onClick={room.finishNow} title="Log the work so far and take a break">
            <Stop size={14} />
            Finish &amp; log now
          </button>
        ) : null}
        <span className="tiny muted">{MODE_HINT[room.doc.mode]}</span>
      </div>

      <div className="timer-meta">
        {editingIntention ? (
          <form
            style={{ width: '100%' }}
            onSubmit={(event) => {
              event.preventDefault();
              room.patchDoc({ intention: draft.trim().slice(0, 160) });
              setEditingIntention(false);
            }}
          >
            <input
              ref={intentionRef}
              className="field"
              value={draft}
              maxLength={160}
              placeholder="What is this session for?"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => {
                room.patchDoc({ intention: draft.trim().slice(0, 160) });
                setEditingIntention(false);
              }}
            />
          </form>
        ) : (
          <button
            className="intention"
            onClick={() => {
              setDraft(room.doc.intention);
              setEditingIntention(true);
            }}
            title="Set the intention for this session"
          >
            <Bolt size={15} />
            <span style={{ flex: 1 }}>
              {room.doc.intention || 'Add a one-line intention for this session'}
            </span>
            <Pencil size={13} />
          </button>
        )}

        <div className="row between" style={{ width: '100%' }}>
          <span className="small" style={{ minWidth: 0 }}>
            {activeTask ? (
              <>
                <span className="muted">Focusing on </span>
                <strong style={{ fontWeight: 550 }}>{activeTask.text}</strong>
              </>
            ) : (
              <span className="muted">No task selected — pick one from the list</span>
            )}
          </span>
          <span className="tiny muted" style={{ textAlign: 'right' }}>
            {onlineNow.length} {onlineNow.length === 1 ? 'device' : 'devices'} in the room
            {room.doc.updatedBy ? ` · ${room.doc.updatedBy} set the timer ${relativeTime(room.doc.updatedAt, room.now)}` : ''}
          </span>
        </div>
      </div>
    </section>
  );
}

