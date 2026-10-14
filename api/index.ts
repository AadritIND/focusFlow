/**
 * Vercel Edge Function — the whole FocusFlow API under `/api/*`.
 *
 * Vercel's recommended pattern is one shared API entry point plus a rewrite
 * that sends every `/api/*` request here (see vercel.json); the handler then
 * routes by URL pathname. This runs the exact same router as the Cloudflare
 * Worker (`worker/index.ts`); the only difference is the database binding, a
 * Turso/libSQL database behind the D1-compatible shim in `worker/libsql.ts`.
 *
 * Required environment variables (set them on the Vercel project):
 *   TURSO_DATABASE_URL   e.g. libsql://focusflow-<org>.turso.io
 *   TURSO_AUTH_TOKEN     a Turso database auth token
 */
import { createClient } from '@libsql/client/web';
import { handleApi } from '../worker/index.js';
import { LibsqlDatabase, type SqlClient } from '../worker/libsql.js';
import type { Env } from '../worker/lib.js';

export const config = { runtime: 'edge' };

/* Read env through globalThis so we don't clash with other `process` typings. */
const readEnv = (): Record<string, string | undefined> =>
  (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

let cachedEnv: Env | null = null;

function buildEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = readEnv();
  if (!TURSO_DATABASE_URL) throw new Error('TURSO_DATABASE_URL is not configured');
  const client = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });
  // The API only ever touches `DB`; the casts bridge the D1-shaped Env type and
  // libSQL's stricter (but runtime-compatible) binding value types.
  const db = new LibsqlDatabase(client as unknown as SqlClient);
  cachedEnv = { DB: db as unknown as Env['DB'], APP_NAME: 'FocusFlow' };
  return cachedEnv;
}

/**
 * The rewrite preserves the original request URL, so `request.url` still looks
 * like `…/api/rooms/<code>/sync`. If a host ever hands us the rewritten `…/api`
 * instead, fall back to the `x-vercel-original-url` style header when present.
 */
function originalRequest(request: Request): Request {
  const url = new URL(request.url);
  if (url.pathname !== '/api' && url.pathname !== '/api/') return request;
  const forwarded = request.headers.get('x-vercel-original-url') ?? request.headers.get('x-forwarded-uri');
  if (!forwarded) return request;
  try {
    const restored = new URL(forwarded, url.origin);
    return new Request(restored, request);
  } catch {
    return request;
  }
}

export default async function handler(request: Request): Promise<Response> {
  let env: Env;
  try {
    env = buildEnv();
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error';
    return new Response(JSON.stringify({ error: 'server_error', detail }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return handleApi(originalRequest(request), env);
}
