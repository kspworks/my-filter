import { router } from "~/server/trpc/init";
import { consumablesRouter } from "~/server/trpc/routers/consumables";
import { invitesRouter } from "~/server/trpc/routers/invites";
import { systemsRouter } from "~/server/trpc/routers/systems";

export const appRouter = router({
  systems: systemsRouter,
  consumables: consumablesRouter,
  invites: invitesRouter,
});

export type AppRouter = typeof appRouter;
