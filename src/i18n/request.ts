import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { isLocale, LOCALE_COOKIE, negotiateLocale } from "~/i18n/locale";
import { loadMessages } from "~/i18n/messages";

/**
 * Resolution order: an explicit choice (cookie) beats the browser's stated
 * preference, which beats the default. `cookies()` and `headers()` are
 * async-only as of Next 16.
 */
export default getRequestConfig(async () => {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(stored)
    ? stored
    : negotiateLocale((await headers()).get("accept-language"));

  return { locale, messages: await loadMessages(locale) };
});
