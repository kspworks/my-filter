import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { DEMO_EMAIL } from "~/lib/demo";
import {
  consumableReplacements,
  consumables,
  digestOptOuts,
  systems,
} from "~/server/db/schema/app";
import { protectedProcedure, router } from "~/server/trpc/init";

/**
 * The account itself. Name, password and deletion go through better-auth's own
 * endpoints, which is where the password is verified. What lives here is what
 * belongs to this app rather than to authentication.
 */
export const accountRouter = router({
  settings: protectedProcedure.query(async ({ ctx }) => {
    const [optOut] = await ctx.db
      .select({ userId: digestOptOuts.userId })
      .from(digestOptOuts)
      .where(eq(digestOptOuts.userId, ctx.user.id));

    return {
      name: ctx.user.name,
      email: ctx.user.email,
      digestEnabled: !optOut,
      isDemo: ctx.user.email === DEMO_EMAIL,
    };
  }),

  setDigestEnabled: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Never emailed in the first place, and the account is shared.
      if (ctx.user.email === DEMO_EMAIL) {
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
    const [ownedSystems, ownedConsumables, replacements] = await Promise.all([
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
      account: { name: ctx.user.name, email: ctx.user.email },
      systems: ownedSystems,
      consumables: ownedConsumables,
      replacements,
    };
  }),
});
