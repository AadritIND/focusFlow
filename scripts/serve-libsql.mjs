/**
 * Run the FocusFlow API as a plain Node HTTP server backed by a local libSQL
 * (SQLite) file — the very same adapter Vercel uses — so the whole API test
 * suite can run offline before anything is deployed.
 *
 * Usage: node scripts/serve-libsql.mjs [port] [dbFile]
 */
import { createServer } from 'node:http';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createClient } from '@libsql/client';

const port = Number(process.argv[2] || 8790);
const tursoUrl = process.env.TURSO_DATABASE_URL;
const dbFile = tursoUrl ? null : resolve(process.argv[3] || '.dev/focusflow.db');
if (dbFile) {
  await mkdir(dirname(dbFile), { recursive: true });
  // Fresh database every run keeps the suite deterministic.
  if (existsSync(dbFile)) await rm(dbFile, { force: true });
}

/* Bundle the exact same modules the Worker/Vercel function use, from source. */
const bundle = await build({
  stdin: {
    contents:
      "export { handleApi } from './worker/index';\nexport { LibsqlDatabase } from './worker/libsql';\n",
    resolveDir: resolve('.'),
    sourcefile: 'harness-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  conditions: ['worker', 'browser'],
  target: 'es2022',
  write: false,
  logLevel: 'warning',
});
const tmpModule = join(tmpdir(), `focusflow-api-${Date.now()}.mjs`);
await writeFile(tmpModule, bundle.outputFiles[0].text);
const { handleApi, LibsqlDatabase } = await import(pathToFileURL(tmpModule).href);
await rm(tmpModule, { force: true });

const client = tursoUrl
  ? createClient({ url: tursoUrl, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${dbFile}` });
const env = { DB: new LibsqlDatabase(client), APP_NAME: 'FocusFlow' };

const HOP_BY_HOP = new Set(['host', 'connection', 'content-length', 'transfer-encoding']);

const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const method = req.method || 'GET';
    const hasBody = method !== 'GET' && method !== 'HEAD' && chunks.length > 0;
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(key) && typeof value === 'string') headers[key] = value;
    }
    const request = new Request(`http://127.0.0.1:${port}${req.url}`, {
      method,
      headers,
      body: hasBody ? Buffer.concat(chunks) : undefined,
    });
    const response = await handleApi(request, env);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'harness_error', detail: String(error?.message ?? error) }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`FocusFlow API (libSQL: ${tursoUrl ?? dbFile}) listening on http://127.0.0.1:${port}`);
});

const shutdown = () => {
  server.close();
  client.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
