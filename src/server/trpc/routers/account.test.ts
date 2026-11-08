import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEMO_EMAIL } from "~/lib/demo";
import { callerFor } from "~/test-utils/caller";
import { createUser, makeTestDb, type TestDb } from "~/test-utils/db";

let db: TestDb;
let close: () => void;

beforeEach(async () => {
  ({ db, close } = await makeTestDb());
});

afterEach(() => close());

describe("settings", () => {
  it("starts with the digest on, for an ordinary account", async () => {
    const caller = await callerFor(db, await createUser(db, "alice"));

    expect(await caller.account.settings()).toEqual({
      name: "alice",
      email: "alice@example.com",
      digestEnabled: true,
      isDemo: false,
    });
  });

  it("turns the digest off and on again, and either is safe to repeat", async () => {
    const caller = await callerFor(db, await createUser(db, "alice"));

    await caller.account.setDigestEnabled({ enabled: false });
    await caller.account.setDigestEnabled({ enabled: false });
    expect((await caller.account.settings()).digestEnabled).toBe(false);

    await caller.account.setDigestEnabled({ enabled: true });
    await caller.account.setDigestEnabled({ enabled: true });
    expect((await caller.account.settings()).digestEnabled).toBe(true);
  });
});

describe("the demo account", () => {
  it("is recognised, and cannot change its email reminders", async () => {
    const caller = await callerFor(
      db,
      await createUser(db, "demo", { email: DEMO_EMAIL }),
    );

    expect((await caller.account.settings()).isDemo).toBe(true);
    await expect(
      caller.account.setDigestEnabled({ enabled: false }),
    ).rejects.toThrow(/demo account/i);
  });
});
