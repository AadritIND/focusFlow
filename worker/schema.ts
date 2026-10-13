/**
 * Schema bootstrap.
 *
 * These statements mirror worker/schema.sql and are applied by the Worker itself
 * on first use, so a fresh deployment (or a fresh local D1) works with no manual
 * migration step. Every statement is idempotent.
 */

export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS rooms (
     code        TEXT PRIMARY KEY,
     name        TEXT NOT NULL,
     tz          TEXT NOT NULL DEFAULT 'UTC',
     created_at  INTEGER NOT NULL,
     updated_at  INTEGER NOT NULL,
     created_by  TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS room_state (
     code        TEXT PRIMARY KEY REFERENCES rooms(code) ON DELETE CASCADE,
     revision    INTEGER NOT NULL DEFAULT 1,
     doc         TEXT NOT NULL,
     updated_at  INTEGER NOT NULL,
     updated_by  TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS members (
     code        TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
     device_id   TEXT NOT NULL,
     name        TEXT NOT NULL,
     token       TEXT NOT NULL,
     joined_at   INTEGER NOT NULL,
     last_seen   INTEGER NOT NULL,
     status      TEXT,
     PRIMARY KEY (code, device_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_members_last_seen ON members (code, last_seen DESC)`,
  `CREATE TABLE IF NOT EXISTS sessions (
     seq         INTEGER PRIMARY KEY AUTOINCREMENT,
     id          TEXT NOT NULL UNIQUE,
     code        TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
     device_id   TEXT,
     member_name TEXT,
     day         TEXT NOT NULL,
     kind        TEXT NOT NULL,
     started_at  INTEGER NOT NULL,
     ended_at    INTEGER NOT NULL,
     minutes     INTEGER NOT NULL,
     task_id     TEXT,
     task_label  TEXT,
     created_at  INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_code_day ON sessions (code, day)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_code_seq ON sessions (code, seq)`,
  `CREATE TABLE IF NOT EXISTS session_tombstones (
     seq         INTEGER PRIMARY KEY AUTOINCREMENT,
     code        TEXT NOT NULL,
     id          TEXT NOT NULL,
     created_at  INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_tombstones_code_seq ON session_tombstones (code, seq)`,
];
