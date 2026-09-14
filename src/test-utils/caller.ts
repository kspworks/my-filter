import type { Locale } from "~/i18n/locale";
import { createAppTranslator } from "~/i18n/translator";
// Type-only, and load-bearing: `context.ts` imports `~/server/db` and therefore
// `src/env.ts`. Importing a value from it here would make every test that uses
// a caller — including the jsdom component tests — demand a real environment.
import type { TRPCContext } from "~/server/trpc/context";
import { createCallerFactory } from "~/server/trpc/init";
import { appRouter } from "~/server/trpc/routers/_app";
import type { TestDb } from "~/test-utils/db";

const createCaller = createCallerFactory(appRouter);

/**
 * A real translator rather than a stub, so assertions read against the text a
 * user would actually be shown, and a procedure that raises an error through a
 * missing message key fails here.
 */
export async function makeContext(
  db: TestDb,
  userId: string | null,
  locale: Locale = "en",
): Promise<TRPCContext> {
  return {
    db,
    session: null,
    user: userId ? ({ id: userId } as NonNullable<TRPCContext["user"]>) : null,
    locale,
    t: await createAppTranslator(locale),
  } as TRPCContext;
}

export async function callerFor(
  db: TestDb,
  userId: string | null,
  locale: Locale = "en",
) {
  return createCaller(await makeContext(db, userId, locale));
}
