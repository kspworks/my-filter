import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError, z } from "zod";
import { isCuid } from "~/server/db/id";
import type { TRPCContext } from "~/server/trpc/context";

const t = initTRPC.context<TRPCContext>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? z.flattenError(error.cause) : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Everything user-owned goes through here. It narrows `ctx.user` to non-null so
 * downstream resolvers cannot forget the ownership filter for lack of a user id.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Shared input primitives. */
export const zId = z.string().refine(isCuid, "Invalid id");
export const zDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date");
