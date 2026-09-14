import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNull, max } from "drizzle-orm";
import { z } from "zod";
import type { AppTranslator } from "~/i18n/translator";
import { CONSUMABLE_TYPES, INTERVAL_UNITS } from "~/lib/consumables";
import type { DbOrTransaction, Transaction } from "~/server/db";
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

const consumableFields = {
  type: z.enum(CONSUMABLE_TYPES),
  name: z.string().trim().min(1).max(120),
  intervalValue: z.int().min(1).max(600),
  intervalUnit: z.enum(INTERVAL_UNITS),
  notes: z.string().trim().max(2000).nullish(),
};

/** No `Date` columns leave the API, so responses stay plain JSON-safe values. */
const consumableColumns = {
  id: consumables.id,
  systemId: consumables.systemId,
  type: consumables.type,
  name: consumables.name,
  intervalValue: consumables.intervalValue,
  intervalUnit: consumables.intervalUnit,
  lastChangedOn: consumables.lastChangedOn,
  notes: consumables.notes,
};

/**
 * Keeps the denormalized `lastChangedOn` equal to the newest entry in the
 * replacement log. Every write that touches the log ends here, so the two can
 * never drift — which is what makes undo and backdating safe.
 */
async function syncLastChanged(
  tx: Transaction,
  consumableId: string,
  userId: string,
) {
  const [latest] = await tx
    .select({ changedOn: max(consumableReplacements.changedOn) })
    .from(consumableReplacements)
    .where(eq(consumableReplacements.consumableId, consumableId));

  if (!latest?.changedOn) return;

  await tx
    .update(consumables)
    .set({ lastChangedOn: latest.changedOn })
    .where(
      and(eq(consumables.id, consumableId), eq(consumables.userId, userId)),
    );
}

/**
 * Throws unless the system exists AND belongs to the caller.
 *
 * Takes the translator rather than reaching for a request-scoped one: the
 * message ends up in a toast, so it has to be in the caller's language.
 */
async function assertOwnsSystem(
  db: DbOrTransaction,
  systemId: string,
  userId: string,
  t: AppTranslator,
) {
  const [system] = await db
    .select({ id: systems.id })
    .from(systems)
    .where(and(eq(systems.id, systemId), eq(systems.userId, userId)));

  if (!system) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: t("errors.systemNotFound"),
    });
  }
}

export const consumablesRouter = router({
  /**
   * Every consumable the user owns, with a little context about where it sits.
   * Due dates and ordering are computed by the caller against the viewer's own
   * "today" — the server never guesses the user's calendar day.
   */
  list: protectedProcedure
    .input(
      z
        .object({
          systemId: zId.optional(),
          unassignedOnly: z.boolean().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const filters = [eq(consumables.userId, ctx.user.id)];
      if (input?.systemId) {
        filters.push(eq(consumables.systemId, input.systemId));
      }
      if (input?.unassignedOnly) {
        filters.push(isNull(consumables.systemId));
      }

      return ctx.db
        .select({
          ...consumableColumns,
          systemManufacturer: systems.manufacturer,
          systemModel: systems.model,
        })
        .from(consumables)
        .leftJoin(systems, eq(consumables.systemId, systems.id))
        .where(and(...filters))
        .orderBy(asc(consumables.name));
    }),

  create: protectedProcedure
    .input(
      z.object({
        ...consumableFields,
        systemId: zId.nullish(),
        lastChangedOn: zDateString,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.systemId) {
        await assertOwnsSystem(ctx.db, input.systemId, ctx.user.id, ctx.t);
      }

      return ctx.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(consumables)
          .values({
            userId: ctx.user.id,
            systemId: input.systemId ?? null,
            type: input.type,
            name: input.name,
            intervalValue: input.intervalValue,
            intervalUnit: input.intervalUnit,
            lastChangedOn: input.lastChangedOn,
            notes: input.notes ?? null,
          })
          .returning(consumableColumns);

        if (!created) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        }

        await tx.insert(consumableReplacements).values({
          consumableId: created.id,
          userId: ctx.user.id,
          changedOn: input.lastChangedOn,
          // The oldest entry *is* the installation; the UI derives that label
          // from position, so no display text is stored here.
          note: null,
        });

        return created;
      });
    }),

  update: protectedProcedure
    .input(z.object({ id: zId, ...consumableFields }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(consumables)
        .set({
          type: input.type,
          name: input.name,
          intervalValue: input.intervalValue,
          intervalUnit: input.intervalUnit,
          notes: input.notes ?? null,
        })
        .where(
          and(
            eq(consumables.id, input.id),
            eq(consumables.userId, ctx.user.id),
          ),
        )
        .returning(consumableColumns);

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: ctx.t("errors.consumableNotFound"),
        });
      }
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: zId }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(consumables)
        .where(
          and(
            eq(consumables.id, input.id),
            eq(consumables.userId, ctx.user.id),
          ),
        )
        .returning({ id: consumables.id });

      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: ctx.t("errors.consumableNotFound"),
        });
      }
      return deleted;
    }),

  attach: protectedProcedure
    .input(z.object({ id: zId, systemId: zId }))
    .mutation(async ({ ctx, input }) => {
      // Checked separately: without this, a user could park their own consumable
      // on somebody else's system by guessing an id.
      await assertOwnsSystem(ctx.db, input.systemId, ctx.user.id, ctx.t);

      const [updated] = await ctx.db
        .update(consumables)
        .set({ systemId: input.systemId })
        .where(
          and(
            eq(consumables.id, input.id),
            eq(consumables.userId, ctx.user.id),
          ),
        )
        .returning(consumableColumns);

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: ctx.t("errors.consumableNotFound"),
        });
      }
      return updated;
    }),

  detach: protectedProcedure
    .input(z.object({ id: zId }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(consumables)
        .set({ systemId: null })
        .where(
          and(
            eq(consumables.id, input.id),
            eq(consumables.userId, ctx.user.id),
          ),
        )
        .returning(consumableColumns);

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: ctx.t("errors.consumableNotFound"),
        });
      }
      return updated;
    }),

  /** The one-tap action: record a replacement and move the schedule forward. */
  markReplaced: protectedProcedure
    .input(
      z.object({
        id: zId,
        changedOn: zDateString,
        note: z.string().trim().max(500).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [owned] = await tx
          .select({ id: consumables.id })
          .from(consumables)
          .where(
            and(
              eq(consumables.id, input.id),
              eq(consumables.userId, ctx.user.id),
            ),
          );

        if (!owned) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: ctx.t("errors.consumableNotFound"),
          });
        }

        await tx.insert(consumableReplacements).values({
          consumableId: input.id,
          userId: ctx.user.id,
          changedOn: input.changedOn,
          note: input.note ?? null,
        });

        await syncLastChanged(tx, input.id, ctx.user.id);

        const [updated] = await tx
          .select(consumableColumns)
          .from(consumables)
          .where(eq(consumables.id, input.id));

        if (!updated) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        }
        return updated;
      });
    }),

  /** Undoes a mis-tap. Never removes the initial entry — that is the install date. */
  undoLastReplacement: protectedProcedure
    .input(z.object({ id: zId }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const entries = await tx
          .select({ id: consumableReplacements.id })
          .from(consumableReplacements)
          .where(
            and(
              eq(consumableReplacements.consumableId, input.id),
              eq(consumableReplacements.userId, ctx.user.id),
            ),
          )
          .orderBy(
            desc(consumableReplacements.changedOn),
            desc(consumableReplacements.createdAt),
          );

        const [newest] = entries;
        if (!newest) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: ctx.t("errors.consumableNotFound"),
          });
        }
        if (entries.length === 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: ctx.t("errors.installEntryProtected"),
          });
        }

        await tx
          .delete(consumableReplacements)
          .where(eq(consumableReplacements.id, newest.id));

        await syncLastChanged(tx, input.id, ctx.user.id);

        const [updated] = await tx
          .select(consumableColumns)
          .from(consumables)
          .where(eq(consumables.id, input.id));

        if (!updated) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        }
        return updated;
      });
    }),

  history: protectedProcedure
    .input(z.object({ id: zId }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select({
          id: consumableReplacements.id,
          changedOn: consumableReplacements.changedOn,
          note: consumableReplacements.note,
        })
        .from(consumableReplacements)
        .where(
          and(
            eq(consumableReplacements.consumableId, input.id),
            eq(consumableReplacements.userId, ctx.user.id),
          ),
        )
        .orderBy(
          desc(consumableReplacements.changedOn),
          desc(consumableReplacements.createdAt),
        );
    }),
});
