-- FocusFlow schema (Cloudflare D1 / SQLite)
-- A room is the unit of sharing: it owns one shared timer document, a member list,
-- and an append-only session log. Totals are always derived from the log, so two
-- devices can record sessions independently and nothing is ever overwritten.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS rooms (
  code        TEXT PRIMARY KEY,           -- human-shareable secret, e.g. AMBER-FOX-73
  name        TEXT NOT NULL,
  tz          TEXT NOT NULL DEFAULT 'UTC',-- IANA zone that defines the room's day boundary
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  created_by  TEXT
);

-- Shared, single-row document per room: timer mode/run state, tasks, room settings.
CREATE TABLE IF NOT EXISTS room_state (
  code        TEXT PRIMARY KEY REFERENCES rooms(code) ON DELETE CASCADE,
  revision    INTEGER NOT NULL DEFAULT 1,
  doc         TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  updated_by  TEXT
);

CREATE TABLE IF NOT EXISTS members (
  code        TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  device_id   TEXT NOT NULL,
  name        TEXT NOT NULL,
  token       TEXT NOT NULL,             -- kept by that device only; gates writes
  joined_at   INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  status      TEXT,                      -- JSON {mode,running,endsAt,task}
  PRIMARY KEY (code, device_id)
);

CREATE INDEX IF NOT EXISTS idx_members_last_seen ON members (code, last_seen DESC);

-- Append-only session log. `seq` gives clients a cheap incremental cursor.
CREATE TABLE IF NOT EXISTS sessions (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  id          TEXT NOT NULL UNIQUE,      -- deterministic per completed session => dedupes across devices
  code        TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  device_id   TEXT,
  member_name TEXT,
  day         TEXT NOT NULL,             -- YYYY-MM-DD in the room's timezone
  kind        TEXT NOT NULL,             -- focus | short | long
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER NOT NULL,
  minutes     INTEGER NOT NULL,
  task_id     TEXT,
  task_label  TEXT,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_code_day ON sessions (code, day);
CREATE INDEX IF NOT EXISTS idx_sessions_code_seq ON sessions (code, seq);

-- Deletions are recorded so every device can converge on a reset.
CREATE TABLE IF NOT EXISTS session_tombstones (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL,
  id          TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tombstones_code_seq ON session_tombstones (code, seq);
