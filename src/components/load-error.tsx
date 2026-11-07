"use client";

import { CircleAlert, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";

/**
 * What a list shows when its query failed. Without this, a failed fetch has no
 * data, and no data reads as an empty account: "Nothing tracked yet", three
 * zeros and an invitation to start over.
 *
 * Callers branch on `isLoadingError`, not `isError`, so a background refetch
 * that fails keeps showing the rows already on screen.
 */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("common.loadError");

  return (
    <Card role="alert">
      <CardContent className="py-12 text-center">
        <CircleAlert className="mx-auto size-6 text-destructive" aria-hidden />
        <p className="mt-2 font-medium">{t("title")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("body")}</p>
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          <RotateCw aria-hidden />
          {t("retry")}
        </Button>
      </CardContent>
    </Card>
  );
}
