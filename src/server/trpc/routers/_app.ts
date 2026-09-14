import { router } from "~/server/trpc/init";
import { consumablesRouter } from "~/server/trpc/routers/consumables";
import { systemsRouter } from "~/server/trpc/routers/systems";

export const appRouter = router({
  systems: systemsRouter,
  consumables: consumablesRouter,
});

export type AppRouter = typeof appRouter;
