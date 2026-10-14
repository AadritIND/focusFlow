# FocusFlow

A study timer you share instead of repeat.

The original single-file timer ([FocusFlow.html](FocusFlow.html)) is kept in this repo as the design
reference — the whole app is built around that UI: same palette, same frosted-glass cards, same
mode-tinted background, same pill controls and system type. What changed is everything underneath it.

- **A real home page** with live counters, a working preview of the timer, a world-clock strip, the
  feature tour and an FAQ.
- **Rooms with permanent codes.** `POST /api/rooms` mints a code like `AMBER-FOX-73` that never
  expires. Anyone with the code joins; nothing else is needed.
- **Live multi-device sync.** Every device in a room shows the same countdown, the same task, the
  same breaks. Anyone can pause, anyone can switch mode.
- **A device never signs in twice.** Membership lives in `localStorage`, so opening the browser again
  drops you straight back into your room.
- **History that is never overwritten.** Sessions are appended, break time is tracked separately, and
  yesterday / the day before / streaks / an 18-week heatmap / per-task time are all derived from it.
- **A world clock** with a day/night read, and a room timezone that decides when "today" ends.

## Typography

The interface is set in [Inter](https://rsms.me/inter/) and the display voice — headings, the
countdown, the headline numbers — in [Space Grotesk](https://github.com/floriankarsten/space-grotesk).
Both are variable fonts, self-hosted through `@fontsource-variable/*` (SIL OFL 1.1) rather than pulled
from a font CDN, so the app works offline and the service worker can cache them like any other asset.
Fonts are loaded per unicode subset, so a browser downloads the latin file it needs and nothing else.

The countdown renders with tabular figures (verified: `11:11`, `00:00`, `08:08` and `99:59` all measure
identically), so digits never shift sideways as the clock ticks.

## Quick start

```bash
npm install
npm run dev:api     # Worker + local D1 on http://127.0.0.1:8787
npm run dev         # app on http://localhost:5173 (proxies /api to the Worker)
```

Open the app, press **Create a room**, and you are studying. Send the code (or the invite link) to
another device to sync it. Nothing to configure — no accounts, no keys.

```bash
npm run check       # typecheck the app and the Worker
npm run build       # dist/client + dist/worker/index.js
npm run test:api    # 49-check end-to-end API suite (needs dev:api running)
```

## Architecture

The API is a single request handler ([worker/index.ts](worker/index.ts)) that speaks to a
D1-shaped SQL database through a thin adapter, so the same router runs on two hosts: a Cloudflare
Worker over D1, or a Vercel Edge Function over Turso. The React client talks to `/api/*` either way.

```
browser (React + Vite, static assets)
  └── /api/*  ──┬──►  Cloudflare Worker (worker/index.ts)  └── D1 (SQLite)
                └──►  Vercel Edge Function (api/index.ts)  └── Turso (libSQL)
                       rooms · room_state · members · sessions · tombstones
```

| Path | What it is |
| --- | --- |
| [worker/index.ts](worker/index.ts) | API: rooms, join/leave, sync, shared doc, session log, public counters |
| [worker/lib.ts](worker/lib.ts) | Types, validation, room-code generation, row coercion |
| [worker/libsql.ts](worker/libsql.ts) | D1-compatible adapter over a libSQL/Turso client |
| [api/index.ts](api/index.ts) | Vercel entrypoint: same handler, edge runtime |
| [worker/schema.ts](worker/schema.ts) | Idempotent DDL the handler applies itself on first use |
| [worker/schema.sql](worker/schema.sql) | The same schema for CLI inspection / manual migration |
| [src/state/room.tsx](src/state/room.tsx) | The sync engine: polling, optimistic writes, session logging, presence |
| [src/lib/stats.ts](src/lib/stats.ts) | Every number in the UI, derived from the session log |
| [src/lib/time.ts](src/lib/time.ts) | Timezone-aware day keys, clocks, formatting, city list |
| [src/styles.css](src/styles.css) | The original timer's design system, applied across the whole app |

### How sync works

A room owns exactly one shared document (`room_state.doc`, JSON) with a monotonic `revision`:

```ts
{ mode, running, startedAt, endsAt, remainingMs, cycle,
  intention, activeTaskId, tasks[], timer { work, short, long, interval, goal } }
```

- **The end time is absolute.** Devices with skewed clocks still agree on the last second; the client
  also subtracts a server clock offset measured on every response.
- **Writes are last-write-wins on the revision.** `UPDATE ... WHERE revision <= ?` decides atomically.
  A device whose write was based on a stale revision gets the current document back and adopts it.
- **Polls, not sockets.** ~1.1s while visible, 4s hidden, with backoff to 8s when the network is down.
  A response carries only what changed (doc when the revision moved, plus sessions/tombstones past a
  cursor), so a steady state is a few hundred bytes per tick.
- **Ticking is local.** The countdown never touches the network; only discrete actions (start, pause,
  reset, skip, task edits, settings) write.
- **Completions are deduped by construction.** A finished session gets the deterministic id
  `s:<code>:<startedAt>`, so if three devices notice the end at once, `INSERT OR IGNORE` stores it once.
- **Deletions propagate as tombstones**, and deleted ids are remembered locally so a device never
  uploads a session that was intentionally removed.
- **Offline is a first-class state.** State and sessions persist to `localStorage` per room, pending
  sessions upload on the next successful poll, and the UI says "Offline" rather than pretending.

### Auth model

There are no accounts. The room code is the shared secret. On join, a device receives a private token;
every write must present `(deviceId, token)` matching a member row, and leaving deletes that row. A
device that has lost its row (fresh database, rotated token) rejoins automatically with the same
identity; a room that no longer exists surfaces a clear "room does not exist" screen and stops polling.

## Running it locally

The Worker creates its own tables on first request, so no migration step is needed. `npm run db:init`
still exists if you prefer to apply [worker/schema.sql](worker/schema.sql) by hand.

The test suite covers room creation and uniqueness, join/rejoin token reuse, write authorisation, revision
conflicts, incremental sync, completion dedupe, tombstone propagation, malformed-input rejection,
timezone validation, presence freshness, batch caps and the public counters.

## Deploying

`npm run build` produces a static client (`dist/client`) and a bundled API (`dist/worker/index.js`).
The same handler can be hosted two ways.

**Cloudflare Workers + D1.** The build output is described by [sites.json](sites.json):

```json
{ "entrypoint": "index.js", "modules": [{ "name": "index.js", "path": "./dist/worker/index.js" }],
  "assetsDirectory": "./dist/client", "spa": true }
```

1. `npm run build`
2. Provision a D1 database and attach it as the `DB` binding.
3. Deploy the manifest. The Worker creates the schema on the first API request.

No secrets or environment variables are required.

**Vercel + Turso.** The live deployment at <https://focussf.vercel.app> runs this way.
[vercel.json](vercel.json) builds the client, serves it from `dist/client`, and routes every
`/api/*` request to a single Edge Function ([api/index.ts](api/index.ts)) plus an SPA fallback.

1. Create a Turso database and a token.
2. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the project's environment variables.
3. Deploy with the Vercel CLI or the GitHub integration. The schema is created on the first API request.

To exercise the real API against the same libSQL backend locally (file-backed by default, or set the
two `TURSO_*` variables to hit the cloud database):

```bash
npm run api:local   # http://127.0.0.1:8790, fresh DB at .dev/focusflow.db
npm run test:api http://127.0.0.1:8790
```

## Using it

| Shortcut | Action |
| --- | --- |
| `Space` | start / pause |
| `R` | reset the current session |
| `N` | skip to the next session |
| `1` `2` `3` | focus / short break / long break |
| `H` · `C` · `S` | history · world clock · settings |
| `T` | toggle theme |

Finish early? "Finish & log now" records the elapsed time as a real session. Skipping a running focus
session logs the partial time as well, so nothing is silently lost. Breaks are logged too, but they
never count towards focus minutes or the daily goal.

Rooms also carry a device list (with each device's live mode and remaining time), shared tasks with
per-task time, an ambient soundscape (brown noise / rain / room hum, synthesised — no audio files),
a daily goal, streaks, goal-days, CSV export of the whole history, and a PWA manifest so it installs.

## License

MIT — see [LICENSE](LICENSE). Take it, fork it, ship it.

## Known limits

- Presence is "seen in the last 25 seconds", not a socket handshake; a device that sleeps shows as away.
- The session-log cursor assumes monotonically increasing ids, so a room's history is append-only by
  design. Edits happen through delete + re-add (which is exactly what the UI offers).
- Sync is one room per browser tab set; leaving a room clears that membership only.
