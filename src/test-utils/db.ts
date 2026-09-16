// `@libsql/client/node` rather than the bare specifier on purpose: the package's
// `browser` export condition points at a web build that cannot open `:memory:`,
// and the jsdom project resolves with browser conditions.
import { createClient } from "@libsql/client/node";
import { createId } from "@paralleldrive/cuid2";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "~/server/db/schema";

/**
 * A throwaway database per test: `:memory:` built from the real migrations in
 * `./drizzle`, so a schema change that was never generated into a migration
 * fails here rather than silently letting every other test run against a stale
 * shape. Deliberately not `~/server/db`, whose singleton would drag `src/env.ts`
 * into the module graph of every test that touches a router.
 */

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export type TestDbHandle = {
  db: TestDb;
  /** Each database holds a native connection; tests must release it. */
  close: () => void;
};

export async function makeTestDb(): Promise<TestDbHandle> {
  const client = createClient({ url: ":memory:" });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db, close: () => client.close() };
}

export async function createUser(
  db: TestDb,
  name: string,
  { email = `${name}@example.com` } = {},
): Promise<string> {
  const id = createId();
  await db.insert(schema.user).values({
    id,
    name,
    email,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}
