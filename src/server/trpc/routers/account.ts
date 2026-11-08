import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { DEMO_EMAIL } from "~/lib/demo";
import type { DbOrTransaction } from "~/server/db";
import {
  consumableReplacements,
  consumables,
  digestOptOuts,
  systems,
} from "~/server/db/schema/app";
import { user } from "~/server/db/schema/auth";
import { protectedProcedure, router } from "~/server/trpc/init";

/**
 * From the row rather than the session, like `isDemoAccount` in the invites
 * router: a rename shows here straight away, and nothing depends on what the
 * session object happens to carry.
 */
async function readAccount(db: DbOrTransaction, userId: string) {
  const [row] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, userId));
  if (!row) throw new TRPCError({ code: "UNAUTHORIZED" });
  return row;
}

/**
 * The account itself. Name, password and deletion go through better-auth's own
 * endpoints, which is where the password is verified. What lives here is what
 * belongs to this app rather than to authentication.
 */
export const accountRouter = router({
  settings: protectedProcedure.query(async ({ ctx }) => {
    const [account, [optOut]] = await Promise.all([
      readAccount(ctx.db, ctx.user.id),
      ctx.db
        .select({ userId: digestOptOuts.userId })
        .from(digestOptOuts)
        .where(eq(digestOptOuts.userId, ctx.user.id)),
    ]);

    return {
      ...account,
      digestEnabled: !optOut,
      isDemo: account.email === DEMO_EMAIL,
    };
  }),

  setDigestEnabled: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Never emailed in the first place, and the account is shared.
      const { email } = await readAccount(ctx.db, ctx.user.id);
      if (email === DEMO_EMAIL) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: ctx.t("errors.demoCannotChange"),
        });
      }

      if (input.enabled) {
        await ctx.db
          .delete(digestOptOuts)
          .where(eq(digestOptOuts.userId, ctx.user.id));
      } else {
        await ctx.db
          .insert(digestOptOuts)
          .values({ userId: ctx.user.id })
          .onConflictDoNothing();
      }
      return { digestEnabled: input.enabled };
    }),

  /**
   * Everything a person has put in, as plain JSON-safe values. Explicit columns
   * as everywhere else, so nothing added to a table later leaves by accident.
   */
  exportData: protectedProcedure.query(async ({ ctx }) => {
    const [account, ownedSystems, ownedConsumables, replacements] =
      await Promise.all([
        readAccount(ctx.db, ctx.user.id),
        ctx.db
          .select({
            id: systems.id,
            manufacturer: systems.manufacturer,
            model: systems.model,
            installedOn: systems.installedOn,
            notes: systems.notes,
          })
          .from(systems)
          .where(eq(systems.userId, ctx.user.id))
          .orderBy(asc(systems.installedOn)),
        ctx.db
          .select({
            id: consumables.id,
            systemId: consumables.systemId,
            type: consumables.type,
            name: consumables.name,
            intervalValue: consumables.intervalValue,
            intervalUnit: consumables.intervalUnit,
            lastChangedOn: consumables.lastChangedOn,
            productUrl: consumables.productUrl,
            notes: consumables.notes,
          })
          .from(consumables)
          .where(eq(consumables.userId, ctx.user.id))
          .orderBy(asc(consumables.name)),
        ctx.db
          .select({
            consumableId: consumableReplacements.consumableId,
            changedOn: consumableReplacements.changedOn,
            note: consumableReplacements.note,
          })
          .from(consumableReplacements)
          .where(eq(consumableReplacements.userId, ctx.user.id))
          .orderBy(asc(consumableReplacements.changedOn)),
      ]);

    return {
      account,
      systems: ownedSystems,
      consumables: ownedConsumables,
      replacements,
    };
  }),
});
