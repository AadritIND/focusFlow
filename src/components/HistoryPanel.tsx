import { useMemo, useState } from 'react';
import { useRoom } from '../state/room';
import { deriveStats, dayTitle, formatHour, sessionsToCsv, type DayStat } from '../lib/stats';
import { dayLabel, fmtDayKey, fmtDuration, fmtTime, relativeTime } from '../lib/time';
import { MODE_LABEL, type Session } from '../lib/types';
import { Chevron, Download, Trash } from './icons';
import { ConfirmDialog, Modal, useToast } from './ui';
import { todayKey } from '../lib/time';

type Tab = 'overview' | 'days' | 'log';

export function HistoryPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const room = useRoom();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; label: string; run: () => void } | null>(null);

  const tz = room.meta.tz;
  const today = todayKey(tz);
  const stats = useMemo(() => deriveStats(room.sessions, room.doc.timer, tz), [room.sessions, room.doc.timer, tz]);

  const dayMap = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const session of room.sessions) {
      const list = map.get(session.day) ?? [];
      list.push(session);
      map.set(session.day, list);
    }
    return map;
  }, [room.sessions]);

  const daysDesc = useMemo(() => [...dayMap.keys()].sort((a, b) => (a < b ? 1 : -1)), [dayMap]);
  const logDesc = useMemo(() => [...room.sessions].sort((a, b) => b.endedAt - a.endedAt), [room.sessions]);

  if (!open) return null;

  const download = () => {
    const csv = sessionsToCsv(room.sessions, tz);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `focusflow-${room.code}-${today}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast(`Exported ${room.sessions.length} sessions`);
  };

  const dayDetail = (day: DayStat) => {
    const sessions = (dayMap.get(day.key) ?? []).slice().sort((a, b) => a.startedAt - b.startedAt);
    return (
      <div style={{ padding: '4px 0 14px 12px' }}>
        {sessions.length === 0 ? (
          <p className="tiny muted">Nothing logged that day.</p>
        ) : (
          sessions.map((session) => (
            <div className="log-row" key={session.id}>
              <span className={`kind ${session.kind}`} />
              <span className="when num">
                {fmtTime(session.endedAt, tz, room.prefs.hour24, false)}
              </span>
              <span className="dur num">
                {fmtDuration(session.minutes)}
              </span>
              <span className="task">
                {session.taskLabel ?? <span className="muted">{MODE_LABEL[session.kind]}</span>}
              </span>
              <span className="who tiny muted">{session.memberName ?? ''}</span>
              <button
                className="icon-btn"
                aria-label="Delete session"
                onClick={() => room.deleteSessions({ ids: [session.id] })}
              >
                <Trash size={13} />
              </button>
            </div>
          ))
        )}
        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <button
            className="btn sm danger"
            onClick={() =>
              setConfirm({
                title: `Delete ${dayLabel(day.key, tz)}?`,
                body: 'Those sessions disappear for every device in the room. This cannot be undone.',
                label: 'Delete day',
                run: () => void room.deleteSessions({ day: day.key }),
              })
            }
          >
            <Trash size={13} />
            Delete this day
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <Modal
        title="History"
        subtitle={`Days roll over at midnight in ${tz}`}
        onClose={onClose}
        wide
        tabs={
          <div className="tabs" role="tablist">
            {(['overview', 'days', 'log'] as Tab[]).map((value) => (
              <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>
                {value === 'overview' ? 'Overview' : value === 'days' ? `Previous days (${daysDesc.length})` : `Session log (${logDesc.length})`}
              </button>
            ))}
          </div>
        }
        footer={
          <>
            <span className="small muted">
              {fmtDuration(stats.totals.focusMinutes)} focused across {stats.totals.activeDays}{' '}
              {stats.totals.activeDays === 1 ? 'day' : 'days'} in this room
            </span>
            <span className="row" style={{ gap: 8 }}>
              <button className="btn sm" onClick={download} disabled={!room.sessions.length}>
                <Download size={14} />
                Export CSV
              </button>
              <button
                className="btn sm quiet danger"
                disabled={!stats.today.sessions}
                onClick={() =>
                  setConfirm({
                    title: "Delete today's sessions?",
                    body: 'Today will start from zero again on every device in the room.',
                    label: "Delete today",
                    run: () => void room.deleteSessions({ day: today }),
                  })
                }
              >
                Reset today
              </button>
            </span>
          </>
        }
      >
        {tab === 'overview' ? (
          <div>
            <div className="tile" style={{ marginBottom: 14 }}>
              <div className="tiny muted">Current streak</div>
              <div className="num" style={{ fontSize: 26 }}>
                {stats.streak.current} {stats.streak.current === 1 ? 'day' : 'days'}
              </div>
              <div className="tiny muted">
                {stats.streak.activeToday ? 'Kept alive today' : 'One session keeps it alive'} · best {stats.streak.best}
              </div>
            </div>

            <div className="kv">
              <div className="cell">
                <div className="k">Today</div>
                <div className="v">{fmtDuration(stats.today.focusMinutes)}</div>
                <div className="s">
                  {stats.today.focusSessions} focus · {stats.today.sessions} logged
                </div>
              </div>
              <div className="cell">
                <div className="k">Yesterday</div>
                <div className="v">{fmtDuration(stats.yesterday.focusMinutes)}</div>
                <div className="s">
                  {stats.yesterday.focusSessions} focus ·{' '}
                  {stats.yesterday.lastAt ? `last at ${fmtTime(stats.yesterday.lastAt, tz, room.prefs.hour24, false)}` : 'idle day'}
                </div>
              </div>
              <div className="cell">
                <div className="k">{fmtDayKey(stats.dayBefore.key, { weekday: 'long' })}</div>
                <div className="v">{fmtDuration(stats.dayBefore.focusMinutes)}</div>
                <div className="s">{stats.dayBefore.focusSessions} focus sessions</div>
              </div>
              <div className="cell">
                <div className="k">All time</div>
                <div className="v">{fmtDuration(stats.totals.focusMinutes)}</div>
                <div className="s">
                  {stats.totals.focusSessions} focus · {fmtDuration(stats.totals.breakMinutes)} on breaks
                </div>
              </div>
              <div className="cell">
                <div className="k">Goals completed</div>
                <div className="v">{stats.goalsCompleted}</div>
                <div className="s">
                  Days the {stats.goal.target}-session goal was met
                </div>
              </div>
            </div>

            <p className="label" style={{ margin: '22px 0 10px' }}>
              Last 18 weeks
            </p>
            <div className="heat">
              {stats.heatmap.map((week, index) => (
                <div className="week" key={index}>
                  {week.map((cell, dayIndex) =>
                    cell ? (
                      <span
                        key={cell.key}
                        className={`cell l${cell.level}${cell.key === today ? ' today' : ''}`}
                        title={`${dayTitle(cell.key)}: ${fmtDuration(cell.focusMinutes)} focused`}
                      />
                    ) : (
                      <span className="cell empty" key={`${index}-${dayIndex}`} />
                    ),
                  )}
                </div>
              ))}
            </div>
            <div className="row between" style={{ marginTop: 6 }}>
              <span className="tiny muted">
                {dayTitle(stats.heatmap[0]?.[0]?.key ?? today)} → {dayTitle(today)}
              </span>
              <span className="row tiny muted" style={{ gap: 4 }}>
                less
                {[0, 1, 2, 3, 4].map((level) => (
                  <span key={level} className={`cell l${level}`} style={{ width: 10, height: 10 }} />
                ))}
                more
              </span>
            </div>

            <p className="label" style={{ margin: '22px 0 10px' }}>
              Insights
            </p>
            <div className="settings-grid">
              <div className="tile">
                <div className="tiny muted">Best day</div>
                <div className="num" style={{ fontSize: 20 }}>
                  {stats.bestDay ? fmtDuration(stats.bestDay.focusMinutes) : '—'}
                </div>
                <div className="tiny muted">{stats.bestDay ? dayTitle(stats.bestDay.key) : 'No sessions yet'}</div>
              </div>
              <div className="tile">
                <div className="tiny muted">Average active day</div>
                <div className="num" style={{ fontSize: 20 }}>
                  {stats.averageDay ? fmtDuration(stats.averageDay) : '—'}
                </div>
                <div className="tiny muted">Across {stats.totals.activeDays} active days</div>
              </div>
              <div className="tile">
                <div className="tiny muted">Sharpest hour</div>
                <div className="num" style={{ fontSize: 20 }}>
                  {stats.topHour === null ? '—' : formatHour(stats.topHour, room.prefs.hour24)}
                </div>
                <div className="tiny muted">Most focus minutes land here</div>
              </div>
              <div className="tile">
                <div className="tiny muted">Longest session</div>
                <div className="num" style={{ fontSize: 20 }}>
                  {stats.longestSession ? fmtDuration(stats.longestSession.minutes) : '—'}
                </div>
                <div className="tiny muted">
                  {stats.longestSession?.taskLabel ?? (stats.longestSession ? 'Unassigned focus' : 'No sessions yet')}
                </div>
              </div>
              <div className="tile">
                <div className="tiny muted">Week over week</div>
                <div className="num" style={{ fontSize: 20 }}>
                  {stats.lastWeekMinutes
                    ? `${stats.thisWeekMinutes >= stats.lastWeekMinutes ? '+' : '−'}${Math.round(
                        (Math.abs(stats.thisWeekMinutes - stats.lastWeekMinutes) / stats.lastWeekMinutes) * 100,
                      )}%`
                    : fmtDuration(stats.thisWeekMinutes)}
                </div>
                <div className="tiny muted">
                  {fmtDuration(stats.thisWeekMinutes)} this week · {fmtDuration(stats.lastWeekMinutes)} last week
                </div>
              </div>
            </div>

            <p className="label" style={{ margin: '22px 0 10px' }}>
              Focus by hour in the day
            </p>
            <div className="hourgrid">
              {stats.hourHistogram.map((minutes, hour) => {
                const max = Math.max(...stats.hourHistogram, 1);
                return (
                  <span
                    key={hour}
                    title={`${formatHour(hour, room.prefs.hour24)} — ${fmtDuration(minutes)}`}
                    style={{
                      background:
                        minutes === 0
                          ? 'var(--surface-2)'
                          : `color-mix(in srgb, var(--accent) ${Math.round((minutes / max) * 85 + 15)}%, transparent)`,
                    }}
                  />
                );
              })}
            </div>
            <div className="row between tiny muted" style={{ marginTop: 4 }}>
              <span>00</span>
              <span>06</span>
              <span>12</span>
              <span>18</span>
              <span>23</span>
            </div>

            {stats.perTask.length ? (
              <>
                <p className="label" style={{ margin: '22px 0 10px' }}>
                  Time by task
                </p>
                {stats.perTask.map((task) => {
                  const max = stats.perTask[0].minutes || 1;
                  return (
                    <div className="day-row" key={task.key}>
                      <span className="left">
                        <span className="title">{task.label}</span>
                        <span className="bar-track" style={{ marginTop: 6 }}>
                          <span className="bar-fill" style={{ width: `${(task.minutes / max) * 100}%`, display: 'block' }} />
                        </span>
                      </span>
                      <span className="val">
                        {fmtDuration(task.minutes)}
                        <span className="tiny muted" style={{ display: 'block' }}>
                          {task.sessions} sess
                        </span>
                      </span>
                    </div>
                  );
                })}
              </>
            ) : null}
          </div>
        ) : null}

        {tab === 'days' ? (
          <div>
            {daysDesc.length === 0 ? (
              <p className="empty-state">
                No sessions yet. Finish a focus session and the day appears here — with what you worked on and who was
                in the room.
              </p>
            ) : (
              daysDesc.map((key) => {
                const day = dayMap.get(key)!;
                const focus = day.filter((s) => s.kind === 'focus');
                const minutes = focus.reduce((n, s) => n + s.minutes, 0);
                const expanded = openDay === key;
                const stat: DayStat = {
                  key,
                  focusMinutes: minutes,
                  breakMinutes: day.reduce((n, s) => n + (s.kind === 'focus' ? 0 : s.minutes), 0),
                  sessions: day.length,
                  focusSessions: focus.length,
                  tasks: [],
                  firstAt: null,
                  lastAt: null,
                };
                return (
                  <div key={key}>
                    <button
                      className="day-row"
                      style={{ width: '100%', textAlign: 'left' }}
                      onClick={() => setOpenDay(expanded ? null : key)}
                    >
                      <span style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>
                        <Chevron size={14} />
                      </span>
                      <span className="left">
                        <span className="title">{dayLabel(key, tz)}</span>
                        <span className="sub">
                          {focus.length} focus · {day.length - focus.length} breaks · {stat.breakMinutes}m resting
                        </span>
                      </span>
                      <span className="val">{fmtDuration(minutes)}</span>
                    </button>
                    {expanded ? dayDetail(stat) : null}
                  </div>
                );
              })
            )}
          </div>
        ) : null}

        {tab === 'log' ? (
          <div>
            {logDesc.length === 0 ? (
              <p className="empty-state">Nothing logged yet.</p>
            ) : (
              logDesc.slice(0, 300).map((session) => (
                <div className="log-row" key={session.id}>
                  <span className={`kind ${session.kind}`} />
                  <span className="when wide muted">
                    {dayLabel(session.day, tz)} {fmtTime(session.endedAt, tz, room.prefs.hour24, false)}
                  </span>
                  <span className="dur num">
                    {fmtDuration(session.minutes)}
                  </span>
                  <span className="mode muted">
                    {MODE_LABEL[session.kind]}
                  </span>
                  <span className="task">
                    {session.taskLabel ?? <span className="muted">—</span>}
                  </span>
                  <span className="who tiny muted">
                    {session.memberName ?? 'this device'} · {relativeTime(session.endedAt, room.now)}
                  </span>
                  <button
                    className="icon-btn"
                    aria-label="Delete session"
                    onClick={() => room.deleteSessions({ ids: [session.id] })}
                  >
                    <Trash size={13} />
                  </button>
                </div>
              ))
            )}
            {logDesc.length > 300 ? (
              <p className="tiny muted" style={{ marginTop: 10 }}>
                Showing the newest 300 of {logDesc.length}. Export to CSV for the full log.
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.label}
          onClose={() => setConfirm(null)}
          onConfirm={confirm.run}
        />
      ) : null}
    </>
  );
}
