import type { Session, TimerSettings } from './types';
import { addDays, dayKey, fmtDayKey, hourInTz, todayKey } from './time';

export interface DayStat {
  key: string;
  focusMinutes: number;
  breakMinutes: number;
  sessions: number;
  focusSessions: number;
  tasks: string[];
  firstAt: number | null;
  lastAt: number | null;
}

export interface HeatCell {
  key: string;
  focusMinutes: number;
  level: number;
}

export interface TaskTotal {
  key: string;
  label: string;
  minutes: number;
  sessions: number;
}

export interface DerivedStats {
  today: DayStat;
  yesterday: DayStat;
  dayBefore: DayStat;
  week: DayStat[];
  last14: DayStat[];
  heatmap: (HeatCell | null)[][];
  totals: {
    minutes: number;
    focusMinutes: number;
    breakMinutes: number;
    sessions: number;
    focusSessions: number;
    activeDays: number;
  };
  streak: { current: number; best: number; activeToday: boolean };
  goalsCompleted: number;
  bestDay: DayStat | null;
  averageDay: number;
  longestSession: Session | null;
  hourHistogram: number[];
  topHour: number | null;
  perTask: TaskTotal[];
  thisWeekMinutes: number;
  lastWeekMinutes: number;
  goal: { target: number; done: number; pct: number };
}

export function emptyDay(key: string): DayStat {
  return {
    key,
    focusMinutes: 0,
    breakMinutes: 0,
    sessions: 0,
    focusSessions: 0,
    tasks: [],
    firstAt: null,
    lastAt: null,
  };
}

const isFocus = (s: Session) => s.kind === 'focus';

function addToDay(day: DayStat, session: Session) {
  day.sessions += 1;
  if (isFocus(session)) {
    day.focusMinutes += session.minutes;
    day.focusSessions += 1;
    if (session.taskLabel && !day.tasks.includes(session.taskLabel)) day.tasks.push(session.taskLabel);
  } else {
    day.breakMinutes += session.minutes;
  }
  const at = session.endedAt || session.startedAt;
  day.firstAt = day.firstAt === null || at < day.firstAt ? at : day.firstAt;
  day.lastAt = day.lastAt === null || at > day.lastAt ? at : day.lastAt;
}

/** Deepest run of consecutive active days, computed from the active-day set. */
function bestStreak(active: Set<string>, today: string): number {
  if (!active.size) return 0;
  const sorted = [...active].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === addDays(sorted[i - 1], 1)) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > best) best = run;
  }
  // A streak that is still alive includes today unless it has not started yet.
  void today;
  return best;
}

export function deriveStats(
  sessions: Session[],
  timer: TimerSettings,
  tz: string,
  heatmapWeeks = 18,
): DerivedStats {
  const byDay = new Map<string, DayStat>();
  const active = new Set<string>();
  const hourHistogram = new Array(24).fill(0) as number[];
  const taskMap = new Map<string, TaskTotal>();
  let longest: Session | null = null;
  let focusMinutesTotal = 0;
  let minutesTotal = 0;
  let focusSessions = 0;

  for (const s of sessions) {
    if (!s || typeof s.minutes !== 'number' || !s.day) continue;
    let day = byDay.get(s.day);
    if (!day) {
      day = emptyDay(s.day);
      byDay.set(s.day, day);
    }
    addToDay(day, s);
    minutesTotal += s.minutes;
    if (isFocus(s)) {
      focusMinutesTotal += s.minutes;
      focusSessions += 1;
      active.add(s.day);
      hourHistogram[hourInTz(s.startedAt, tz)] += s.minutes;
      const key = s.taskId || s.taskLabel || '__none';
      const label = s.taskLabel || 'Unassigned focus';
      const entry = taskMap.get(key) ?? { key, label, minutes: 0, sessions: 0 };
      entry.minutes += s.minutes;
      entry.sessions += 1;
      taskMap.set(key, entry);
      if (!longest || s.minutes > longest.minutes) longest = s;
    }
  }

  const today = todayKey(tz);
  const statFor = (key: string) => byDay.get(key) ?? emptyDay(key);

  const week = Array.from({ length: 7 }, (_, i) => statFor(addDays(today, i - 6)));
  const last14 = Array.from({ length: 14 }, (_, i) => statFor(addDays(today, i - 13)));

  // Streak: count back from today, or from yesterday when today is still empty.
  let cursor = active.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (active.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  // Heatmap columns are weeks starting on Monday.
  const [ty, tm, td] = today.split('-').map(Number);
  const weekdayIndex = (new Date(Date.UTC(ty, tm - 1, td, 12)).getUTCDay() + 6) % 7;
  const startKey = addDays(today, -(weekdayIndex + (heatmapWeeks - 1) * 7));
  const heatmap: (HeatCell | null)[][] = [];
  for (let w = 0; w < heatmapWeeks; w++) {
    const column: (HeatCell | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const key = addDays(startKey, w * 7 + d);
      if (key > today) {
        column.push(null);
        continue;
      }
      const minutes = byDay.get(key)?.focusMinutes ?? 0;
      const level = minutes === 0 ? 0 : minutes < 26 ? 1 : minutes < 51 ? 2 : minutes < 101 ? 3 : 4;
      column.push({ key, focusMinutes: minutes, level });
    }
    heatmap.push(column);
  }

  const days = [...byDay.values()];
  const bestDay = days.length ? days.reduce((a, b) => (b.focusMinutes > a.focusMinutes ? b : a)) : null;
  const activeDays = active.size;
  const thisWeek = Array.from({ length: 7 }, (_, i) => statFor(addDays(today, i - 6)));
  const prevWeek = Array.from({ length: 7 }, (_, i) => statFor(addDays(today, i - 13)));
  const topHour = hourHistogram.some((v) => v > 0)
    ? hourHistogram.indexOf(Math.max(...hourHistogram))
    : null;

  return {
    today: statFor(today),
    yesterday: statFor(addDays(today, -1)),
    dayBefore: statFor(addDays(today, -2)),
    week,
    last14,
    heatmap,
    totals: {
      minutes: minutesTotal,
      focusMinutes: focusMinutesTotal,
      breakMinutes: minutesTotal - focusMinutesTotal,
      sessions: sessions.length,
      focusSessions,
      activeDays,
    },
    streak: { current, best: bestStreak(active, today), activeToday: active.has(today) },
    goalsCompleted: days.filter((day) => day.focusSessions >= Math.max(1, timer.goal)).length,
    bestDay,
    averageDay: activeDays ? Math.round(focusMinutesTotal / activeDays) : 0,
    longestSession: longest,
    hourHistogram,
    topHour,
    perTask: [...taskMap.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 8),
    thisWeekMinutes: thisWeek.reduce((n, d) => n + d.focusMinutes, 0),
    lastWeekMinutes: prevWeek.reduce((n, d) => n + d.focusMinutes, 0),
    goal: {
      target: timer.goal,
      done: statFor(today).focusSessions,
      pct: Math.min(100, Math.round((statFor(today).focusSessions / Math.max(1, timer.goal)) * 100)),
    },
  };
}

export function formatHour(hour: number, hour24 = true): string {
  return hour24 ? `${String(hour).padStart(2, '0')}:00` : `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'am' : 'pm'}`;
}

export const dayTitle = (key: string) => fmtDayKey(key, { weekday: 'short', day: 'numeric', month: 'short' });

/** History as CSV, for people who want their own spreadsheet. */
export function sessionsToCsv(sessions: Session[], tz: string): string {
  const header = 'date,kind,minutes,started_at_utc,ended_at_utc,task,logged_by,device';
  const rows = [...sessions]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((s) =>
      [
        s.day,
        s.kind,
        String(s.minutes),
        new Date(s.startedAt).toISOString(),
        new Date(s.endedAt).toISOString(),
        s.taskLabel ?? '',
        s.memberName ?? '',
        s.deviceId ?? '',
      ]
        .map((v) => (v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v))
        .join(','),
    );
  void tz;
  void dayKey;
  return [header, ...rows].join('\n');
}
