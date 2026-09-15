import { vi } from "vitest";

/**
 * Aliased over `~/i18n/set-locale` in the jsdom project, for two reasons now.
 *
 * The real module is a `"use server"` action whose `cookies()` call throws
 * outside a request scope. It also writes the chosen language to
 * `user_settings` for the daily digest to read, which pulls in `~/server/db`
 * and therefore `src/env.ts` — so without this alias every component test that
 * renders the language switcher or the register form would demand a real
 * environment and a real database.
 *
 * The cookie round-trip and the row it writes are covered for real by
 * `e2e/i18n.spec.ts` and `src/server/auth.test.ts`.
 */
export const setLocale = vi.fn(async (_locale: string) => {});
