import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEMO_EMAIL } from "~/lib/demo";
import { MAX_OPEN_INVITES } from "~/lib/invites";
import { callerFor } from "~/test-utils/caller";
import { createUser, makeTestDb, type TestDb } from "~/test-utils/db";

let db: TestDb;
let close: () => void;
let alice: string;

beforeEach(async () => {
  ({ db, close } = await makeTestDb());
  alice = await createUser(db, "alice");
});

afterEach(() => close());

const inviteOnly = { inviteOnly: true };

describe("with registration open", () => {
  it("has no invite feature at all", async () => {
    const caller = await callerFor(db, alice);
    const opened = await callerFor(db, alice, "en", inviteOnly);
    const { id } = await opened.invites.create();

    for (const call of [
      () => caller.invites.list(),
      () => caller.invites.create(),
      () => caller.invites.revoke({ id }),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
  });
});

describe("with registration by invite", () => {
  it("creates, lists and revokes a link", async () => {
    const caller = await callerFor(db, alice, "en", inviteOnly);

    const created = await caller.invites.create();
    expect(await caller.invites.list()).toMatchObject({
      invites: [{ id: created.id, status: "pending" }],
      openCount: 1,
      maxOpen: MAX_OPEN_INVITES,
      canInvite: true,
    });

    await caller.invites.revoke({ id: created.id });
    expect(await caller.invites.list()).toMatchObject({
      invites: [{ id: created.id, status: "revoked" }],
      openCount: 0,
    });
  });

  it("explains the cap in the reader's language", async () => {
    const caller = await callerFor(db, alice, "uk", inviteOnly);
    for (let i = 0; i < MAX_OPEN_INVITES; i++) {
      await caller.invites.create();
    }

    await expect(caller.invites.create()).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringMatching(/[Ѐ-ӿ].*5/),
    });
  });

  it("refuses to revoke a link twice", async () => {
    const caller = await callerFor(db, alice, "en", inviteOnly);
    const { id } = await caller.invites.create();
    await caller.invites.revoke({ id });

    await expect(caller.invites.revoke({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("does not let the shared demo account invite anyone", async () => {
    const demo = await createUser(db, "demo", { email: DEMO_EMAIL });
    const caller = await callerFor(db, demo, "en", inviteOnly);

    await expect(caller.invites.create()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await caller.invites.list()).toMatchObject({ canInvite: false });
  });
});
