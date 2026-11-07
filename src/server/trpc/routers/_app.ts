import { router } from "~/server/trpc/init";
import { accountRouter } from "~/server/trpc/routers/account";
import { consumablesRouter } from "~/server/trpc/routers/consumables";
import { invitesRouter } from "~/server/trpc/routers/invites";
import { systemsRouter } from "~/server/trpc/routers/systems";

export const appRouter = router({
  systems: systemsRouter,
  consumables: consumablesRouter,
  invites: invitesRouter,
  account: accountRouter,
});

export type AppRouter = typeof appRouter;
