/**
 * D1 de teste sobre `node:sqlite` (Node 22.5+). Só para vitest; não entra no bundle do portal.
 * Implementa a parte da API do D1 que as Functions usam: prepare/bind/first/all/run e batch transacional.
 */
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { D1Database, D1PreparedStatement, D1Result } from "../../functions/_lib/env";

const require = createRequire(import.meta.url);
// `node:sqlite` não é resolvido pelo vite-node; carregar por require.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => any };

const isRows = (sql: string) => /^\s*(select|with|pragma)\b/i.test(sql) || /\breturning\b/i.test(sql);

export function createTestDb(): D1Database & { raw: { exec(sql: string): void; prepare(sql: string): { all(...a: unknown[]): unknown[] } } } {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const dir = join(import.meta.dirname, "..", "..", "migrations");
  for (const f of readdirSync(dir).filter(n => n.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, f), "utf8"));

  const make = (sql: string, params: unknown[]): D1PreparedStatement => ({
    bind: (...v: unknown[]) => make(sql, v),
    async first<T>() {
      const rows = db.prepare(sql).all(...params) as T[];
      return rows[0] ?? null;
    },
    async all<T>(): Promise<D1Result<T>> {
      if (isRows(sql)) return { results: db.prepare(sql).all(...params) as T[], success: true, meta: {} };
      const r = db.prepare(sql).run(...params);
      return { results: [], success: true, meta: { changes: Number(r.changes) } };
    },
    async run(): Promise<D1Result> {
      if (isRows(sql)) {
        const rows = db.prepare(sql).all(...params);
        return { results: rows, success: true, meta: { changes: rows.length } };
      }
      const r = db.prepare(sql).run(...params);
      return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
  });

  return {
    prepare: (sql: string) => make(sql, []),
    async batch(stmts: D1PreparedStatement[]) {
      db.exec("BEGIN");
      try {
        const out: D1Result[] = [];
        for (const s of stmts) out.push(await s.run());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    raw: db,
  };
}
