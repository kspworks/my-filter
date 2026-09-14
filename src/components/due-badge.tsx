"use client";

import { Badge } from "~/components/ui/badge";
import type { DueStatus } from "~/lib/due-date";
import { useDuePhrase } from "~/lib/format-date";
import { useLabels } from "~/lib/labels";
import { cn } from "~/lib/utils";

const STATUS_CLASSES: Record<DueStatus, string> = {
  overdue: "border-destructive/40 bg-destructive/10 text-destructive",
  due_soon:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

export function DueBadge({
  status,
  daysUntilDue,
  className,
}: {
  status: DueStatus;
  daysUntilDue: number;
  className?: string;
}) {
  const labels = useLabels();
  const duePhrase = useDuePhrase();

  return (
    <Badge
      variant="outline"
      className={cn(STATUS_CLASSES[status], "font-medium", className)}
      title={labels.dueStatus(status)}
    >
      {duePhrase(daysUntilDue)}
    </Badge>
  );
}
