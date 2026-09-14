import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { env } from "~/env";
import { db } from "~/server/db";
import { newId } from "~/server/db/id";
import { account, session, user, verification } from "~/server/db/schema/auth";

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
