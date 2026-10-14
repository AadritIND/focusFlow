/**
 * A tiny D1-compatible shim over a libSQL / Turso client.
 *
 * The API in `worker/index.ts` is written against Cloudflare's D1 interface
 * (`prepare().bind().first()/.all()/.run()` plus `batch()`). libSQL speaks the
 * same standard SQLite dialect with `?` placeholders, so this adapter lets the
 * exact same handlers run against a Turso database on Vercel — with no SQL
 * changes and no Cloudflare bindings.
 *
 * The client is injected (typed structurally) so this file stays dependency
 * free: it never imports `@libsql/client` itself.
 */

export interface SqlStatement {
  sql: string;
  args: unknown[];
}

export interface SqlResultSet {
  rows: Array<Record<string, unknown>>;
  rowsAffected: number;
}

export interface SqlClient {
  execute(statement: SqlStatement): Promise<SqlResultSet>;
  batch(statements: SqlStatement[], mode?: string): Promise<SqlResultSet[]>;
}

interface RunResult {
  meta?: { changes?: number };
}

/* libSQL is stricter than D1 about value types — booleans and undefined are not
 * valid bindings — so normalise them the way D1 would before they reach SQLite. */
const coerce = (value: unknown): unknown => {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
};

class LibsqlStatement {
  constructor(
    private readonly client: SqlClient,
    readonly sql: string,
    private readonly args: unknown[] = [],
  ) {}

  bind(...values: unknown[]): LibsqlStatement {
    return new LibsqlStatement(this.client, this.sql, values.map(coerce));
  }

  /** The `{ sql, args }` shape libSQL's `execute`/`batch` expects. */
  toStatement(): SqlStatement {
    return { sql: this.sql, args: this.args };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const result = await this.client.execute(this.toStatement());
    return (result.rows[0] as T | undefined) ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    const result = await this.client.execute(this.toStatement());
    return { results: result.rows as T[] };
  }

  async run(): Promise<RunResult> {
    const result = await this.client.execute(this.toStatement());
    return { meta: { changes: result.rowsAffected } };
  }
}

/** Drop-in replacement for `env.DB` (a `D1Database`) backed by libSQL/Turso. */
export class LibsqlDatabase {
  constructor(private readonly client: SqlClient) {}

  prepare(sql: string): LibsqlStatement {
    return new LibsqlStatement(this.client, sql);
  }

  /** D1 runs a batch atomically; libSQL's `write` mode does the same. */
  async batch(statements: LibsqlStatement[]): Promise<RunResult[]> {
    const results = await this.client.batch(
      statements.map((statement) => statement.toStatement()),
      'write',
    );
    return results.map((result) => ({ meta: { changes: result.rowsAffected } }));
  }
}
