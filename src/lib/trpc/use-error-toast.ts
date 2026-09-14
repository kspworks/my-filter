"use client";

import type { TRPCClientErrorLike } from "@trpc/client";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { toast } from "sonner";
import type { AppRouter } from "~/server/trpc/routers/_app";

type AppError = TRPCClientErrorLike<AppRouter>;

/**
 * One place mutation failures become a toast.
 *
 * Procedures that throw deliberately already carry a translated message (they
 * build it from `ctx.locale`), so those are shown as-is. Everything else —
 * an unhandled server fault, an expired session, a Zod failure whose message
 * is written for developers — gets a sentence a person can act on instead.
 */
export function useErrorToast(): (error: AppError) => void {
  const t = useTranslations("errors");

  return useCallback(
    (error: AppError) => {
      const code = error.data?.code;

      if (error.data?.zodError) {
        toast.error(t("invalidInput"));
        return;
      }
      if (code === "UNAUTHORIZED") {
        toast.error(t("unauthorized"));
        return;
      }
      if (code === "INTERNAL_SERVER_ERROR" || !error.message) {
        toast.error(t("generic"));
        return;
      }

      toast.error(error.message);
    },
    [t],
  );
}
