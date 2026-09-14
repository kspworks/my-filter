"use server";

import { cookies } from "next/headers";
import {
  isLocale,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
} from "~/i18n/locale";

/**
 * A Server Action rather than anything in the render path: cookies cannot be
 * set while a Server Component renders, only in an action or route handler.
 */
export async function setLocale(locale: Locale) {
  if (!isLocale(locale)) return;

  (await cookies()).set(LOCALE_COOKIE, locale, {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
    path: "/",
  });
}
