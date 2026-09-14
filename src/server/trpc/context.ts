import { localeFromCookieHeader } from "~/i18n/locale";
import { createAppTranslator } from "~/i18n/translator";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

export async function createTRPCContext(opts: { headers: Headers }) {
  const session = await auth.api.getSession({ headers: opts.headers });
  // Error messages reach the user as toast text, so a procedure needs to know
  // which language to raise them in. Read straight off the request headers
  // rather than `cookies()`, so the context has no Next.js request dependency.
  const locale = localeFromCookieHeader(opts.headers.get("cookie"));

  return {
    db,
    session,
    user: session?.user ?? null,
    locale,
    t: await createAppTranslator(locale),
  };
}

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;
