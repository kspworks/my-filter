"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

/**
 * better-auth writes its own English messages. It also returns a stable `code`,
 * so translate off that and keep the library's text only as a last resort —
 * a wrong-password message a user cannot read is worse than a generic one.
 *
 * Exported so `catalogue-coverage.test.ts` can assert each code has a message.
 */
export const KNOWN_CODES = [
  "INVALID_EMAIL_OR_PASSWORD",
  "USER_ALREADY_EXISTS",
  "INVALID_EMAIL",
  "PASSWORD_TOO_SHORT",
  "PASSWORD_TOO_LONG",
] as const;

type KnownCode = (typeof KNOWN_CODES)[number];

function isKnownCode(code: unknown): code is KnownCode {
  return typeof code === "string" && KNOWN_CODES.includes(code as KnownCode);
}

export function useAuthErrorMessage() {
  const t = useTranslations("auth.errors");

  return useCallback(
    (
      error: { code?: string; message?: string },
      fallback: "signInFailed" | "signUpFailed",
    ) => {
      if (isKnownCode(error.code)) return t(error.code);
      return t(fallback);
    },
    [t],
  );
}
