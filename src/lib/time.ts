/** Timezone-aware date, clock and duration helpers. */

export interface City {
  city: string;
  country: string;
  tz: string;
}

/** A small curated world list — enough to cover most study rooms without a lookup API. */
export const CITIES: City[] = [
  { city: 'Honolulu', country: 'United States', tz: 'Pacific/Honolulu' },
  { city: 'Los Angeles', country: 'United States', tz: 'America/Los_Angeles' },
  { city: 'Denver', country: 'United States', tz: 'America/Denver' },
  { city: 'Chicago', country: 'United States', tz: 'America/Chicago' },
  { city: 'New York', country: 'United States', tz: 'America/New_York' },
  { city: 'Toronto', country: 'Canada', tz: 'America/Toronto' },
  { city: 'Vancouver', country: 'Canada', tz: 'America/Vancouver' },
  { city: 'Mexico City', country: 'Mexico', tz: 'America/Mexico_City' },
  { city: 'Bogotá', country: 'Colombia', tz: 'America/Bogota' },
  { city: 'Lima', country: 'Peru', tz: 'America/Lima' },
  { city: 'São Paulo', country: 'Brazil', tz: 'America/Sao_Paulo' },
  { city: 'Buenos Aires', country: 'Argentina', tz: 'America/Argentina/Buenos_Aires' },
  { city: 'Reykjavík', country: 'Iceland', tz: 'Atlantic/Reykjavik' },
  { city: 'London', country: 'United Kingdom', tz: 'Europe/London' },
  { city: 'Dublin', country: 'Ireland', tz: 'Europe/Dublin' },
  { city: 'Lisbon', country: 'Portugal', tz: 'Europe/Lisbon' },
  { city: 'Madrid', country: 'Spain', tz: 'Europe/Madrid' },
  { city: 'Paris', country: 'France', tz: 'Europe/Paris' },
  { city: 'Amsterdam', country: 'Netherlands', tz: 'Europe/Amsterdam' },
  { city: 'Berlin', country: 'Germany', tz: 'Europe/Berlin' },
  { city: 'Zurich', country: 'Switzerland', tz: 'Europe/Zurich' },
  { city: 'Rome', country: 'Italy', tz: 'Europe/Rome' },
  { city: 'Vienna', country: 'Austria', tz: 'Europe/Vienna' },
  { city: 'Prague', country: 'Czechia', tz: 'Europe/Prague' },
  { city: 'Warsaw', country: 'Poland', tz: 'Europe/Warsaw' },
  { city: 'Stockholm', country: 'Sweden', tz: 'Europe/Stockholm' },
  { city: 'Oslo', country: 'Norway', tz: 'Europe/Oslo' },
  { city: 'Helsinki', country: 'Finland', tz: 'Europe/Helsinki' },
  { city: 'Athens', country: 'Greece', tz: 'Europe/Athens' },
  { city: 'Kyiv', country: 'Ukraine', tz: 'Europe/Kyiv' },
  { city: 'Istanbul', country: 'Türkiye', tz: 'Europe/Istanbul' },
  { city: 'Moscow', country: 'Russia', tz: 'Europe/Moscow' },
  { city: 'Cairo', country: 'Egypt', tz: 'Africa/Cairo' },
  { city: 'Lagos', country: 'Nigeria', tz: 'Africa/Lagos' },
  { city: 'Nairobi', country: 'Kenya', tz: 'Africa/Nairobi' },
  { city: 'Johannesburg', country: 'South Africa', tz: 'Africa/Johannesburg' },
  { city: 'Tehran', country: 'Iran', tz: 'Asia/Tehran' },
  { city: 'Dubai', country: 'United Arab Emirates', tz: 'Asia/Dubai' },
  { city: 'Karachi', country: 'Pakistan', tz: 'Asia/Karachi' },
  { city: 'Mumbai', country: 'India', tz: 'Asia/Kolkata' },
  { city: 'Delhi', country: 'India', tz: 'Asia/Kolkata' },
  { city: 'Dhaka', country: 'Bangladesh', tz: 'Asia/Dhaka' },
  { city: 'Kathmandu', country: 'Nepal', tz: 'Asia/Kathmandu' },
  { city: 'Bangkok', country: 'Thailand', tz: 'Asia/Bangkok' },
  { city: 'Jakarta', country: 'Indonesia', tz: 'Asia/Jakarta' },
  { city: 'Singapore', country: 'Singapore', tz: 'Asia/Singapore' },
  { city: 'Kuala Lumpur', country: 'Malaysia', tz: 'Asia/Kuala_Lumpur' },
  { city: 'Manila', country: 'Philippines', tz: 'Asia/Manila' },
  { city: 'Hong Kong', country: 'China', tz: 'Asia/Hong_Kong' },
  { city: 'Shanghai', country: 'China', tz: 'Asia/Shanghai' },
  { city: 'Taipei', country: 'Taiwan', tz: 'Asia/Taipei' },
  { city: 'Seoul', country: 'South Korea', tz: 'Asia/Seoul' },
  { city: 'Tokyo', country: 'Japan', tz: 'Asia/Tokyo' },
  { city: 'Sydney', country: 'Australia', tz: 'Australia/Sydney' },
  { city: 'Perth', country: 'Australia', tz: 'Australia/Perth' },
  { city: 'Auckland', country: 'New Zealand', tz: 'Pacific/Auckland' },
  { city: 'UTC', country: 'Coordinated Universal Time', tz: 'UTC' },
];

export const browserTz = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function cityForTz(tz: string): City | undefined {
  return CITIES.find((c) => c.tz === tz);
}

/** A readable city name for any IANA zone, even one outside the curated list. */
export function zoneLabel(tz: string): string {
  const known = cityForTz(tz);
  if (known) return known.city;
  const tail = tz.split('/').pop() ?? tz;
  return tail.replace(/_/g, ' ');
}

/** YYYY-MM-DD for the given instant, evaluated in `tz`. */
export function dayKey(ts: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
}

export const todayKey = (tz: string) => dayKey(Date.now(), tz);

/** Shift a YYYY-MM-DD key by whole days (calendar-safe). */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const base = Date.UTC(y, (m || 1) - 1, d || 1, 12);
  const next = new Date(base + days * 86400000);
  return next.toISOString().slice(0, 10);
}

export const lastNDays = (n: number, tz: string): string[] => {
  const today = todayKey(tz);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(today, -i));
  return out;
};

export const isDayKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Format a day key for display without letting the local zone shift it. */
export function fmtDayKey(key: string, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!isDayKey(key)) return key;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...opts }).format(date);
}

export function dayLabel(key: string, tz: string): string {
  const today = todayKey(tz);
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  if (key === addDays(today, 1)) return 'Tomorrow';
  return fmtDayKey(key, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function fmtDuration(minutes: number, opts: { compact?: boolean } = {}): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (opts.compact) return m ? `${h}h${m}m` : `${h}h`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtClockRange(hours: number): string {
  if (hours < 10) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours)}h`;
}

/** MM:SS, or H:MM:SS once the timer runs past an hour. */
export function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function fmtTime(ts: number, tz: string, hour24 = true, seconds = false): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      ...(seconds ? { second: '2-digit' } : {}),
      hour12: !hour24,
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString().slice(11, seconds ? 19 : 16);
  }
}

export function hourInTz(ts: number, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).formatToParts(
      new Date(ts),
    );
    const hour = parts.find((p) => p.type === 'hour')?.value ?? '0';
    return Number(hour) % 24;
  } catch {
    return new Date(ts).getUTCHours();
  }
}

export function offsetLabel(tz: string, ts = Date.now()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(
      new Date(ts),
    );
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    return name.replace('GMT', 'UTC');
  } catch {
    return 'UTC';
  }
}

/** Whole-hour difference between a zone and the viewer's own zone. */
export function zoneDiffHours(tz: string, ts = Date.now()): number {
  const at = (zone: string) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(ts));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  };
  try {
    return Math.round(((at(tz) - at(browserTz())) / 3600000) * 2) / 2;
  } catch {
    return 0;
  }
}

export const fmtZoneDiff = (hours: number) => (hours === 0 ? 'same time' : `${hours > 0 ? '+' : '−'}${Math.abs(hours)}h`);

export function relativeTime(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDayKey(dayKey(ts, 'UTC'), { day: 'numeric', month: 'short' });
}

export function searchCities(query: string): City[] {
  const q = query.trim().toLowerCase();
  if (!q) return CITIES;
  return CITIES.filter(
    (c) =>
      c.city.toLowerCase().includes(q) || c.country.toLowerCase().includes(q) || c.tz.toLowerCase().includes(q),
  );
}

/** Time-of-day bucket used by the world clock's day/night dot. */
export function daylight(tz: string, ts = Date.now()): 'night' | 'dawn' | 'day' | 'dusk' {
  const h = hourInTz(ts, tz);
  if (h < 5 || h >= 21) return 'night';
  if (h < 8) return 'dawn';
  if (h < 18) return 'day';
  return 'dusk';
}
