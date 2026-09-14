import { createTranslator } from "next-intl";
import type { Locale } from "~/i18n/locale";
import { loadMessages } from "~/i18n/messages";

/**
 * A translator for code that is not a React component and not necessarily in a
 * request scope — tRPC procedures, and the tests that call them directly.
 *
 * Deliberately *not* `getTranslations()` from `next-intl/server`: that reads the
 * request via `cookies()`, and `ownership.test.ts` invokes the routers through
 * `createCallerFactory` with a hand-built context where no request exists.
 * Passing the locale explicitly keeps the routers callable from anywhere.
 */
export type AppTranslator = Awaited<ReturnType<typeof createAppTranslator>>;

export async function createAppTranslator(locale: Locale) {
  return createTranslator({ locale, messages: await loadMessages(locale) });
}
