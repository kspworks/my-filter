import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { env } from "~/env";
import * as schema from "~/server/db/schema";

/**
 * One libSQL client for the whole process. `DATABASE_URL` decides what that means:
 * `file:` locally, `:memory:` in tests, `libsql://…` (with an auth token) on Turso.
 *
 * Cached on `globalThis` so Next's dev-mode module reloading doesn't open a new
 * connection on every edit.
 */

const createDb = () => {
  const client = createClient({
    url: env.DATABASE_URL,
    authToken: env.DATABASE_AUTH_TOKEN,
  });
  return drizzle(client, { schema });
};

type Db = ReturnType<typeof createDb>;

/** A transaction handle, for helpers that must work inside or outside one. */
export type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTransaction = Db | Transaction;

const globalForDb = globalThis as unknown as { db?: Db };

export const db: Db = globalForDb.db ?? createDb();

if (env.NODE_ENV !== "production") {
  globalForDb.db = db;
}

export { schema };
