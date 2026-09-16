import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Single source of truth for environment variables.
 *
 * `DATABASE_URL` intentionally carries the driver choice: `file:./data/my-filter.db`
 * locally, `:memory:` in tests, `libsql://<name>.turso.io` (plus `DATABASE_AUTH_TOKEN`)
 * in production. Nothing else in the codebase needs to know where the database lives.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.string().min(1),
    DATABASE_AUTH_TOKEN: z.string().min(1).optional(),
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    BETTER_AUTH_URL: z.url(),
    // Mail is optional on purpose. `next.config.ts` imports this file, so a
    // required secret would break `next build` and CI for everyone who has no
    // reason to send anything. `readMailConfig` validates the transport that is
    // actually selected, and names the variable it is missing.
    // Keep the literals in step with MAIL_TRANSPORTS in ~/server/mail/transport.
    MAIL_TRANSPORT: z.enum(["gmail", "log"]).default("log"),
    GMAIL_USER: z.email().optional(),
    GMAIL_APP_PASSWORD: z.string().min(16).optional(),
    MAIL_FROM: z.string().min(1).optional(),
    // Vercel sends this as a bearer token on every cron request. Optional here,
    // and the route rejects everything when it is unset — an unconfigured
    // deploy should be shut, not open.
    CRON_SECRET: z.string().min(16).optional(),
    // One switch for the whole invite feature: off, registration is open and
    // nothing about invites is visible; on, `/register` only accepts a valid
    // invite link and every user gets an Invites page to create them.
    INVITE_ONLY: z.stringbool().default(false),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    MAIL_TRANSPORT: process.env.MAIL_TRANSPORT,
    GMAIL_USER: process.env.GMAIL_USER,
    GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD,
    MAIL_FROM: process.env.MAIL_FROM,
    CRON_SECRET: process.env.CRON_SECRET,
    INVITE_ONLY: process.env.INVITE_ONLY,
  },
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
