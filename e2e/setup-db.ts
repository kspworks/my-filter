import { mkdirSync, rmSync } from "node:fs";
import { createClient } from "@libsql/client/node";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

/**
 * Recreates the throwaway E2E database, so a run never inherits rows from the
 * last one. This runs as the first step of the `webServer` command rather than
 * from `globalSetup`, because Playwright starts the server first and `next
 * build` opens the database while collecting page data.
 *
 * Deliberately not `pnpm db:seed`: that script dates its fixtures relative to
 * the real clock, which is not something to build assertions on. Each spec
 * creates what it needs through the UI.
 */

const DIR = "./.e2e";
const URL = "file:./.e2e/e2e.db";

// Wrapped rather than top-level await: the package is CommonJS, so `tsx`
// compiles this file to CJS.
async function main() {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });

  const client = createClient({ url: URL });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  client.close();

  console.log(`E2E database ready at ${URL}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
