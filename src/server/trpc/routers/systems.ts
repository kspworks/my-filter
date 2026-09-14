import { TRPCError } from "@trpc/server";
import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { findPreset, PRESETS } from "~/lib/presets";
import {
  consumableReplacements,
  consumables,
  systems,
} from "~/server/db/schema/app";
import {
  protectedProcedure,
  router,
  zDateString,
  zId,
} from "~/server/trpc/init";

const systemInput = {
  manufacturer: z.string().trim().min(1).max(120),
  model: z.string().trim().min(1).max(120),
  installedOn: zDateString,
  notes: z.string().trim().max(2000).nullish(),
};

/** Columns safe to hand to the client: no `Date` objects, so no transformer needed. */
const systemColumns = {
  id: systems.id,
  manufacturer: systems.manufacturer,
  model: systems.model,
  installedOn: systems.installedOn,
  notes: systems.notes,
};

export const systemsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        ...systemColumns,
        consumableCount: count(consumables.id),
      })
      .from(systems)
      .leftJoin(consumables, eq(consumables.systemId, systems.id))
      .where(eq(systems.userId, ctx.user.id))
      .groupBy(systems.id)
      .orderBy(asc(systems.manufacturer), asc(systems.model));
  }),

  byId: protectedProcedure
    .input(z.object({ id: zId }))
    .query(async ({ ctx, input }) => {
      const [system] = await ctx.db
        .select(systemColumns)
        .from(systems)
        .where(and(eq(systems.id, input.id), eq(systems.userId, ctx.user.id)));

      if (!system) {
        throw new TRPCError({ code: "NOT_FOUND", message: "System not found" });
      }
      return system;
    }),

  create: protectedProcedure
    .input(z.object(systemInput))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(systems)
        .values({
          userId: ctx.user.id,
          manufacturer: input.manufacturer,
          model: input.model,
          installedOn: input.installedOn,
          notes: input.notes ?? null,
        })
        .returning(systemColumns);

      if (!created) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
      return created;
    }),

  update: protectedProcedure
    .input(z.object({ id: zId, ...systemInput }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(systems)
        .set({
          manufacturer: input.manufacturer,
          model: input.model,
          installedOn: input.installedOn,
          notes: input.notes ?? null,
        })
        .where(and(eq(systems.id, input.id), eq(systems.userId, ctx.user.id)))
        .returning(systemColumns);

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "System not found" });
      }
      return updated;
    }),

  /**
   * Deleting a system detaches its consumables (FK is ON DELETE SET NULL) rather
   * than destroying them along with their replacement history.
   */
  delete: protectedProcedure
    .input(z.object({ id: zId }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(systems)
        .where(and(eq(systems.id, input.id), eq(systems.userId, ctx.user.id)))
        .returning({ id: systems.id });

      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "System not found" });
      }
      return deleted;
    }),

  presets: protectedProcedure.query(() => PRESETS),

  applyPreset: protectedProcedure
    .input(
      z.object({
        systemId: zId,
        presetId: z.string(),
        lastChangedOn: zDateString.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const preset = findPreset(input.presetId);
      if (!preset) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown preset" });
      }

      const [system] = await ctx.db
        .select({ id: systems.id, installedOn: systems.installedOn })
        .from(systems)
        .where(
          and(eq(systems.id, input.systemId), eq(systems.userId, ctx.user.id)),
        );

      if (!system) {
        throw new TRPCError({ code: "NOT_FOUND", message: "System not found" });
      }

      const lastChangedOn = input.lastChangedOn ?? system.installedOn;

      return ctx.db.transaction(async (tx) => {
        const created = await tx
          .insert(consumables)
          .values(
            preset.items.map((item) => ({
              userId: ctx.user.id,
              systemId: system.id,
              type: item.type,
              name: item.name,
              intervalValue: item.intervalValue,
              intervalUnit: item.intervalUnit,
              lastChangedOn,
            })),
          )
          .returning({ id: consumables.id });

        // The install counts as the first service event, so history is complete
        // from the moment the consumable exists.
        await tx.insert(consumableReplacements).values(
          created.map((item) => ({
            consumableId: item.id,
            userId: ctx.user.id,
            changedOn: lastChangedOn,
            note: "Installed",
          })),
        );

        return { created: created.length };
      });
    }),
});
