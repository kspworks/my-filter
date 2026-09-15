import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { env } from "~/env";
import {
  hasLocaleCookie,
  localeFromCookieHeader,
  negotiateLocaleIfSupported,
} from "~/i18n/locale";
import { db } from "~/server/db";
import { newId } from "~/server/db/id";
import { account, session, user, verification } from "~/server/db/schema/auth";
import {
  defaultUserLocale,
  saveUserLocale,
} from "~/server/settings/user-settings";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    // Email delivery is a later iteration; until then a new account is usable
    // immediately rather than stuck behind a verification link nobody receives.
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  user: {
    // The signup form's "username" is a display name. Login is always by email.
    additionalFields: {},
  },
  databaseHooks: {
    session: {
      create: {
        /**
         * Sign-in is where the daily digest learns what language to write in.
         *
         * The cookie is per-browser and invisible to a background job, so the
         * choice is copied into `user_settings` here — the one moment a request
         * carrying it is guaranteed to exist. An explicit cookie is a choice and
         * overwrites; `Accept-Language` is only a guess about a browser, so it
         * fills an empty row and never more than that.
         *
         * A request that says nothing writes nothing, rather than recording the
         * default. Sign-up reaches this hook through the server API with no
         * headers at all, and a default written down is indistinguishable from
         * a choice afterwards — it would block every later, better signal.
         *
         * Best effort throughout: nobody should be locked out because a
         * preference failed to save.
         */
        async after(created, ctx) {
          try {
            const cookie = ctx?.headers?.get("cookie") ?? null;
            if (hasLocaleCookie(cookie)) {
              await saveUserLocale(
                db,
                created.userId,
                localeFromCookieHeader(cookie),
              );
              return;
            }

            const negotiated = negotiateLocaleIfSupported(
              ctx?.headers?.get("accept-language") ?? null,
            );
            if (negotiated) {
              await defaultUserLocale(db, created.userId, negotiated);
            }
          } catch (error) {
            console.error("[auth] could not record the sign-in locale", error);
          }
        },
      },
    },
  },
  advanced: {
    database: {
      // Same cuid2 generator as the application tables, so every id in the
      // database looks alike and stays URL-friendly.
      generateId: () => newId(),
    },
  },
  // Must stay last: lets better-auth set cookies from server actions.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
