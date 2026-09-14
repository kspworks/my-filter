"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTRPC } from "~/lib/trpc/client";

/**
 * Systems and consumables are shown together on nearly every screen (counts,
 * attachments, due dates), so any write invalidates both rather than trying to
 * predict which lists a given mutation touched.
 */
export function useRefreshData() {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries(trpc.systems.pathFilter()),
      queryClient.invalidateQueries(trpc.consumables.pathFilter()),
    ]);
  }, [queryClient, trpc]);
}
