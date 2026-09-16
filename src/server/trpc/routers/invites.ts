import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { DEMO_EMAIL } from "~/lib/demo";
import { MAX_OPEN_INVITES } from "~/lib/invites";
import type { DbOrTransaction } from "~/server/db";
import { user } from "~/server/db/schema/auth";
import {
  countOpenInvites,
  createInvite,
  InviteLimitError,
  listInvites,
  revokeInvite,
} from "~/server/invites/invites";
import { protectedProcedure, router, zId } from "~/server/trpc/init";

/**
 * With `INVITE_ONLY` off there is no invite feature at all, so these answer
 * `NOT_FOUND` rather than `FORBIDDEN` — the same "does not exist" an unknown
 * row gets. Chained after the auth gate, so an anonymous call still fails on
 * the session first.
 */
const invitesProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.inviteOnly) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: ctx.t("errors.invitesUnavailable"),
    });
  }
  return next();
});

/**
 * The demo account's password is printed by `pnpm db:seed` and meant to be
 * shared, so letting it invite would reopen registration to anyone who has it.
 * Looked up by id rather than read off the session, which a test caller fakes.
 */
async function isDemoAccount(
  db: DbOrTransaction,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId));
  return row?.email === DEMO_EMAIL;
}

export const invitesRouter = router({
  list: invitesProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const [invites, openCount, demo] = await Promise.all([
      listInvites(ctx.db, ctx.user.id, now),
      countOpenInvites(ctx.db, ctx.user.id, now),
      isDemoAccount(ctx.db, ctx.user.id),
    ]);

    return {
      invites,
      openCount,
      maxOpen: MAX_OPEN_INVITES,
      canInvite: !demo,
    };
  }),

  create: invitesProcedure.mutation(async ({ ctx }) => {
    if (await isDemoAccount(ctx.db, ctx.user.id)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ctx.t("errors.demoCannotInvite"),
      });
    }

    try {
      return await createInvite(ctx.db, ctx.user.id, new Date());
    } catch (error) {
      if (error instanceof InviteLimitError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: ctx.t("errors.inviteLimit", { count: MAX_OPEN_INVITES }),
        });
      }
      throw error;
    }
  }),

  revoke: invitesProcedure
    .input(z.object({ id: zId }))
    .mutation(async ({ ctx, input }) => {
      const revoked = await revokeInvite(
        ctx.db,
        ctx.user.id,
        input.id,
        new Date(),
      );
      if (!revoked) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: ctx.t("errors.inviteNotFound"),
        });
      }
      return { id: input.id };
    }),
});
