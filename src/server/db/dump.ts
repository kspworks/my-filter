import type { ResultSet } from "@libsql/client";

/**
 * A plain-SQL dump of the whole database, built from `sqlite_master` and row
 * reads rather than a file copy.
 *
 * There is no `sqlite3` binary and no `turso` CLI to lean on, and `@libsql/client`
 * cannot produce a binary snapshot without the native `libsql` package — so the
 * portable backup this project can actually take is a `.sql` script. It restores
 * into a fresh SQLite file or a fresh Turso database with nothing more than a
 * shell that can pipe it in.
 *
 * Anything that can run a query will do as a source: the backup script passes a
 * libSQL read transaction (a *read* one deliberately — a write transaction would
 * hold a lock on production for the length of the dump), and tests pass a thin
 * adapter over a Drizzle handle.
 */

export type DumpSource = {
  execute(statement: string): Promise<ResultSet>;
};

export type DumpStats = {
  tables: { name: string; rows: number }[];
  totalRows: number;
};

/** Rows are fetched in pages so a large table never has to fit in memory at once. */
const PAGE_SIZE = 500;

/** SQLite's own bookkeeping, plus libSQL's. Never ours, never in a dump. */
const INTERNAL_PREFIXES = ["sqlite_", "libsql_"];

/**
 * What a restore has to run before the dump body, and the reason it is a
 * separate export rather than the first thing `dumpDatabase` emits: SQLite
 * ignores this pragma inside a transaction, so it has to land *above* the
 * `BEGIN` that the backup file wraps everything else in.
 *
 * Without it a restore trips over the first foreign key whose parent row the
 * dump has not reached yet — the tables come out in `sqlite_master` order, which
 * knows nothing about which table references which. Enforcement is back on for
 * whatever connection opens the restored database next; this is per-connection.
 */
export const RESTORE_PREAMBLE = "PRAGMA foreign_keys=OFF;";

export function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * A SQLite literal for whatever libSQL handed back.
 *
 * Blobs arrive as `Uint8Array` / `ArrayBuffer` and become `X'…'`; large integers
 * arrive as `bigint` under some `intMode` settings and must not be routed through
 * `Number`. Strings are the only case with an escape, and it is the single one
 * SQLite has: double the quote.
 */
export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot serialize a non-finite number: ${value}`);
    }
    return String(value);
  }
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  if (value instanceof Uint8Array) return blobLiteral(value);
  if (value instanceof ArrayBuffer) return blobLiteral(new Uint8Array(value));
  throw new Error(`Cannot serialize a ${typeof value} into SQL`);
}

function blobLiteral(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return `X'${hex}'`;
}

function isInternal(name: string): boolean {
  return INTERNAL_PREFIXES.some((prefix) => name.startsWith(prefix));
}

type SchemaEntry = { name: string; type: string; sql: string };

async function readSchema(source: DumpSource): Promise<SchemaEntry[]> {
  const result = await source.execute(
    "SELECT name, type, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name",
  );
  return result.rows
    .map((row) => ({
      name: String(row.name),
      type: String(row.type),
      sql: String(row.sql),
    }))
    .filter((entry) => !isInternal(entry.name));
}

/**
 * Writes the dump out one complete, terminated statement at a time.
 *
 * Only the body: the comment header, `RESTORE_PREAMBLE` and the `BEGIN`/`COMMIT`
 * wrapper belong to the script that writes the file, so a test can replay what
 * comes through here verbatim and prove the dump restores.
 *
 * Tables come first with their rows, then every index, trigger and view: the
 * inserts are faster with no indexes to maintain, and a view can safely refer to
 * a table that is by then already there. `__drizzle_migrations` is dumped like
 * any other table on purpose — a restored copy should know which migrations it
 * has, rather than trying to apply them all again.
 */
export async function dumpDatabase(
  source: DumpSource,
  onStatement: (statement: string) => void | Promise<void>,
): Promise<DumpStats> {
  const schema = await readSchema(source);
  const tables = schema.filter((entry) => entry.type === "table");
  const rest = schema.filter((entry) => entry.type !== "table");

  const stats: DumpStats = { tables: [], totalRows: 0 };

  for (const table of tables) {
    await onStatement(`${table.sql};`);
    const rows = await dumpRows(source, table, onStatement);
    stats.tables.push({ name: table.name, rows });
    stats.totalRows += rows;
  }

  for (const entry of rest) await onStatement(`${entry.sql};`);

  return stats;
}

/**
 * Read from the DDL rather than discovered by letting a query fail: a failed
 * statement inside the read transaction the backup script opens would take the
 * transaction with it, and there would be nothing left to retry on.
 */
function hasRowid(ddl: string): boolean {
  return !/\bWITHOUT\s+ROWID\s*;?\s*$/i.test(ddl);
}

async function dumpRows(
  source: DumpSource,
  table: SchemaEntry,
  onStatement: (statement: string) => void | Promise<void>,
): Promise<number> {
  const quoted = quoteIdentifier(table.name);
  // `rowid` gives the pages a stable order, so no row is skipped or repeated
  // across them. A WITHOUT ROWID table has none — there the pages rely on the
  // snapshot being read inside one transaction, which is how the dump is taken.
  const order = hasRowid(table.sql) ? " ORDER BY rowid" : "";
  let offset = 0;

  for (;;) {
    const page = await source.execute(
      `SELECT * FROM ${quoted}${order} LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    );

    if (page.rows.length === 0) return offset;

    const columns = page.columns.map(quoteIdentifier).join(", ");
    for (const row of page.rows) {
      const values = page.columns
        .map((column) => sqlLiteral(row[column]))
        .join(", ");
      await onStatement(
        `INSERT INTO ${quoted} (${columns}) VALUES (${values});`,
      );
    }

    offset += page.rows.length;
    if (page.rows.length < PAGE_SIZE) return offset;
  }
}
