"use server";

import { cookies, headers } from "next/headers";
import {
  isLocale,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
} from "~/i18n/locale";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { saveUserLocale } from "~/server/settings/user-settings";

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

  // The cookie first and the row second, best effort. The cookie is what the
  // next render reads and must never be held hostage by the database; the row
  // exists only for the daily digest, which has no request to read a cookie
  // off. A signed-out visitor keeps cookie-only behaviour.
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (session) await saveUserLocale(db, session.user.id, locale);
  } catch (error) {
    console.error("[set-locale] could not record the language", error);
  }
}
