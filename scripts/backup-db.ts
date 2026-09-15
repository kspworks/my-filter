import "dotenv/config";

import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@libsql/client";
import { env } from "~/env";
import { todayString } from "~/lib/due-date";
import { dumpDatabase, RESTORE_PREAMBLE } from "~/server/db/dump";
import { describeTarget } from "~/server/db/target";

/**
 * Writes a restorable SQL dump of whatever `DATABASE_URL` points at into `./data/`.
 *
 * Meant to be run from a laptop against production, which is the whole reason it
 * builds the dump itself instead of shelling out: there is no `turso` CLI and no
 * `sqlite3` binary to depend on, and `@libsql/client` alone cannot copy the file.
 *
 *   pnpm db:backup                                     # the local database
 *   DATABASE_URL="libsql://…" DATABASE_AUTH_TOKEN="…" pnpm db:backup
 *
 * The file is named for the database and the day — `data/my-filter-2026-09-15.sql`
 * — and a second run on the same day lands beside the first rather than over it.
 * `/data` is gitignored, which matters: the dump contains password hashes and live
 * session tokens.
 */

const OUTPUT_DIR = path.join(process.cwd(), "data");

/** `…-2026-09-15.sql`, then `-2`, `-3`, … so a backup never overwrites a backup. */
async function reserveFilename(name: string): Promise<string> {
  const base = `${name}-${todayString()}`;

  for (let attempt = 1; ; attempt++) {
    const suffix = attempt === 1 ? "" : `-${attempt}`;
    const candidate = path.join(OUTPUT_DIR, `${base}${suffix}.sql`);
    const taken = await stat(candidate).then(
      () => true,
      () => false,
    );
    if (!taken) return candidate;
  }
}

/** Resolves once the chunk has actually been handed off, so a big dump cannot outrun the disk. */
const writerFor = (stream: WriteStream) => (chunk: string) =>
  new Promise<void>((resolve, reject) => {
    stream.write(chunk, (error) => (error ? reject(error) : resolve()));
  });

async function main() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set; there is nothing to back up.");
  }

  const target = describeTarget(env.DATABASE_URL);
  console.log(`Backing up ${target.name} (${target.url})`);

  await mkdir(OUTPUT_DIR, { recursive: true });
  const destination = await reserveFilename(target.name);

  const client = createClient({
    url: env.DATABASE_URL,
    authToken: env.DATABASE_AUTH_TOKEN,
  });
  const file = createWriteStream(destination);
  const write = writerFor(file);

  try {
    // A *read* transaction: the dump is one consistent snapshot, and taking it
    // never blocks the running app from writing.
    const snapshot = await client.transaction("read");
    try {
      await write(
        [
          `-- My Filter backup of ${target.name}`,
          `-- source: ${target.url}`,
          `-- taken:  ${new Date().toISOString()}`,
          "--",
          "-- Restore with:  turso db shell <database> < this-file.sql",
          "--           or:  sqlite3 restored.db < this-file.sql",
          "",
          // Above the BEGIN on purpose — SQLite ignores the pragma inside a
          // transaction, and the restore needs it to hold for the whole file.
          RESTORE_PREAMBLE,
          "BEGIN TRANSACTION;",
          "",
        ].join("\n"),
      );

      const stats = await dumpDatabase(snapshot, (statement) =>
        write(`${statement}\n`),
      );

      await write("\nCOMMIT;\n");
      await new Promise<void>((resolve) => file.end(resolve));

      const { size } = await stat(destination);
      console.log(
        `Wrote ${path.relative(process.cwd(), destination)} (${size} bytes)`,
      );
      for (const table of stats.tables) {
        console.log(`  ${table.name.padEnd(26)}${table.rows}`);
      }
      console.log(`  ${"total".padEnd(26)}${stats.totalRows}`);
      console.log(
        "\nThis file holds password hashes and live session tokens. Keep it out of shared storage.",
      );
    } finally {
      await snapshot.close();
    }
  } finally {
    file.destroy();
    client.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
