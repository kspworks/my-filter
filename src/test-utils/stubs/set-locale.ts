import { vi } from "vitest";

/**
 * Aliased over `~/i18n/set-locale` in the jsdom project: the real module is a
 * `"use server"` action whose `cookies()` call throws outside a request scope.
 * The cookie round-trip it performs is covered end-to-end by `e2e/i18n.spec.ts`.
 */
export const setLocale = vi.fn(async (_locale: string) => {});
