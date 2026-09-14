import { TRPCError } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "~/server/trpc/routers/_app";
import { callerFor } from "~/test-utils/caller";
import { makeTestDb, type TestDb } from "~/test-utils/db";

/**
 * `protectedProcedure` is the only auth gate in the router layer. Rather than
 * listing procedures by hand — a list that goes stale the moment someone adds
 * one — this walks the router, so a new procedure is covered the day it lands.
 */

const PROCEDURES = Object.keys(
  (appRouter as unknown as { _def: { procedures: Record<string, unknown> } })
    ._def.procedures,
);

/** `"systems.byId"` -> `caller.systems.byId` */
function resolve(caller: unknown, path: string) {
  return path
    .split(".")
    .reduce<Record<string, unknown>>(
      (node, segment) => node[segment] as Record<string, unknown>,
      caller as Record<string, unknown>,
    ) as unknown as (input?: unknown) => Promise<unknown>;
}

let db: TestDb;
let close: () => void;

beforeEach(async () => {
  ({ db, close } = await makeTestDb());
});

afterEach(() => close());

describe("every procedure is behind the auth gate", () => {
  it("knows about the whole router", () => {
    // If the walk above ever comes back empty, the cases below would pass
    // without asserting anything.
    expect(PROCEDURES.length).toBeGreaterThanOrEqual(16);
  });

  it.each(PROCEDURES)("rejects %s without a user", async (path) => {
    const anonymous = await callerFor(db, null);

    // The auth middleware is registered before any `.input()` parser, so an
    // unauthenticated call fails on the session, never on the argument.
    await expect(resolve(anonymous, path)({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("input validation", () => {
  it("rejects an id that is not a cuid before touching the database", async () => {
    const caller = await callerFor(db, "unused");

    const failure = await caller.systems
      .byId({ id: "definitely-not-a-cuid" })
      .catch((cause: unknown) => cause);

    // The wire shape of this error — `data.zodError` — is asserted in
    // `src/server/trpc/http.test.ts`, where the error formatter actually runs.
    expect(failure).toBeInstanceOf(TRPCError);
    expect((failure as TRPCError).code).toBe("BAD_REQUEST");
  });
});
