import { useMemo } from 'react';
import { useRoom } from '../state/room';
import { deriveStats, dayTitle } from '../lib/stats';
import { dayKey, fmtDayKey, fmtDuration } from '../lib/time';
import { Calendar, History } from './icons';

export function StatsPanel({ onOpenHistory }: { onOpenHistory: () => void }) {
  const room = useRoom();
  const stats = useMemo(
    () => deriveStats(room.sessions, room.doc.timer, room.meta.tz),
    [room.sessions, room.doc.timer, room.meta.tz],
  );

  const delta = stats.yesterday.focusMinutes
    ? Math.round(((stats.today.focusMinutes - stats.yesterday.focusMinutes) / stats.yesterday.focusMinutes) * 100)
    : null;

  const maxWeek = Math.max(...stats.week.map((d) => d.focusMinutes), 1);

  const since = room.meta.createdAt ? fmtDayKey(dayKey(room.meta.createdAt, room.meta.tz)) : null;

  return (
    <section className="panel" aria-label="Today at a glance">
      <div className="panel-head">
        <span className="label">
          <Calendar size={13} /> Today in {room.meta.name}
        </span>
        <button className="btn sm quiet" onClick={onOpenHistory}>
          <History size={14} />
          History
        </button>
      </div>
      <div className="panel-body">
        <div className="kv">
          <div className="cell">
            <div className="k">Focus time</div>
            <div className="v">{fmtDuration(stats.today.focusMinutes)}</div>
            <div className="s">
              {delta === null
                ? 'First session today'
                : `${delta >= 0 ? '+' : ''}${delta}% vs yesterday (${fmtDuration(stats.yesterday.focusMinutes)})`}
            </div>
          </div>
          <div className="cell">
            <div className="k">Sessions</div>
            <div className="v">
              {stats.today.focusSessions}
              <span className="muted" style={{ fontSize: 15 }}>
                {' '}
                / {stats.goal.target}
              </span>
            </div>
            <div className="s">
              {stats.goal.done >= stats.goal.target
                ? 'Daily goal complete'
                : `${stats.goal.target - stats.goal.done} to go today`}
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${stats.goal.pct}%` }} />
            </div>
          </div>
          <div className="cell room-code-cell">
            <div className="k">Room code</div>
            <div className="v num room-code-value">
              {room.code}
            </div>
            <div className="s room-code-meta">
              <span>
                {room.onlineIds.size} online · {room.members.length}{' '}
                {room.members.length === 1 ? 'device' : 'devices'}
              </span>
              {since ? <span>Since {since}</span> : null}
            </div>
          </div>
        </div>

        <div className="row between" style={{ marginTop: 16, marginBottom: 8 }}>
          <span className="label">Last 7 days</span>
          <span className="small muted num">
            {fmtDuration(stats.thisWeekMinutes)}
            {stats.lastWeekMinutes
              ? ` · ${stats.thisWeekMinutes >= stats.lastWeekMinutes ? '+' : '−'}${fmtDuration(
                  Math.abs(stats.thisWeekMinutes - stats.lastWeekMinutes),
                )} vs previous week`
              : ''}
          </span>
        </div>
        <div className="bars">
          {stats.week.map((day, index) => (
            <div key={day.key} className={`col${index === 6 ? ' today' : ''}`}>
              <span className="cap">{day.focusMinutes ? fmtDuration(day.focusMinutes, { compact: true }) : ''}</span>
              <span className="stack">
                <span
                  className="bar"
                  style={{ height: `${day.focusMinutes ? Math.max(4, (day.focusMinutes / maxWeek) * 100) : 3}%` }}
                  title={`${dayTitle(day.key)}: ${fmtDuration(day.focusMinutes)} focus, ${day.focusSessions} sessions`}
                />
              </span>
              <span className="day">{fmtDayKey(day.key, { weekday: 'narrow' })}</span>
            </div>
          ))}
        </div>

        <div className="row between" style={{ marginTop: 16, borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
          <span className="small">
            <span className="muted">Yesterday </span>
            <span className="num">{fmtDuration(stats.yesterday.focusMinutes)}</span>
            <span className="muted"> · {stats.yesterday.focusSessions} sessions</span>
          </span>
          <span className="small">
            <span className="muted">{fmtDayKey(stats.dayBefore.key, { weekday: 'short' })} </span>
            <span className="num">{fmtDuration(stats.dayBefore.focusMinutes)}</span>
          </span>
          <span className="small">
            <span className="muted">All time </span>
            <span className="num">{fmtDuration(stats.totals.focusMinutes)}</span>
          </span>
        </div>
      </div>
    </section>
  );
}
