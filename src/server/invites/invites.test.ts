import { addDays } from "date-fns";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_OPEN_INVITES } from "~/lib/invites";
import { invites } from "~/server/db/schema/app";
import {
  claimInvite,
  completeInvite,
  countOpenInvites,
  createInvite,
  findUsableInvite,
  InviteLimitError,
  listInvites,
  releaseInvite,
  revokeInvite,
} from "~/server/invites/invites";
import { createUser, makeTestDb, type TestDb } from "~/test-utils/db";

const NOW = new Date("2026-09-16T12:00:00Z");

let db: TestDb;
let close: () => void;
let alice: string;

beforeEach(async () => {
  ({ db, close } = await makeTestDb());
  alice = await createUser(db, "alice");
});

afterEach(() => close());

async function statusOf(id: string, now = NOW) {
  const list = await listInvites(db, alice, now);
  return list.find((invite) => invite.id === id)?.status;
}

describe("creating", () => {
  it("makes an unguessable, pending link that expires in two weeks", async () => {
    const invite = await createInvite(db, alice, NOW);

    expect(invite.status).toBe("pending");
    // 32 random bytes as base64url.
    expect(invite.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(invite.expiresAt).toBe(addDays(NOW, 14).getTime());
    // Numbers, not `Date`s: this goes straight over the wire.
    expect(typeof invite.createdAt).toBe("number");
  });

  it("gives every link its own token", async () => {
    const first = await createInvite(db, alice, NOW);
    const second = await createInvite(db, alice, NOW);

    expect(first.token).not.toBe(second.token);
  });

  it(`stops at ${MAX_OPEN_INVITES} open links`, async () => {
    for (let i = 0; i < MAX_OPEN_INVITES; i++) {
      await createInvite(db, alice, NOW);
    }

    await expect(createInvite(db, alice, NOW)).rejects.toBeInstanceOf(
      InviteLimitError,
    );
  });

  it("frees a slot when a link is revoked, used or expires", async () => {
    const made = [];
    for (let i = 0; i < MAX_OPEN_INVITES; i++) {
      made.push(await createInvite(db, alice, NOW));
    }
    const [revoked, used] = made;
    if (!revoked || !used) throw new Error("setup");

    await revokeInvite(db, alice, revoked.id, NOW);
    await claimInvite(db, used.token, NOW);
    expect(await countOpenInvites(db, alice, NOW)).toBe(MAX_OPEN_INVITES - 2);

    // Past the expiry every one of them is closed.
    expect(await countOpenInvites(db, alice, addDays(NOW, 15))).toBe(0);
    await expect(
      createInvite(db, alice, addDays(NOW, 15)),
    ).resolves.toBeDefined();
  });

  it("counts only the caller's own links", async () => {
    const bob = await createUser(db, "bob");
    for (let i = 0; i < MAX_OPEN_INVITES; i++) {
      await createInvite(db, bob, NOW);
    }

    expect(await countOpenInvites(db, alice, NOW)).toBe(0);
    expect(await listInvites(db, alice, NOW)).toEqual([]);
  });
});

describe("status", () => {
  it("is derived from the row at the moment it is read", async () => {
    const invite = await createInvite(db, alice, NOW);

    expect(await statusOf(invite.id)).toBe("pending");
    expect(await statusOf(invite.id, addDays(NOW, 14))).toBe("expired");
  });

  it("shows who joined through a used link", async () => {
    const invite = await createInvite(db, alice, NOW);
    const carol = await createUser(db, "carol");

    await claimInvite(db, invite.token, NOW);
    await completeInvite(db, invite.token, carol);

    const [listed] = await listInvites(db, alice, NOW);
    expect(listed).toMatchObject({ status: "used", usedByName: "carol" });
  });

  it("revokes only a link that is still open", async () => {
    const invite = await createInvite(db, alice, NOW);
    await claimInvite(db, invite.token, NOW);

    expect(await revokeInvite(db, alice, invite.id, NOW)).toBe(false);
    expect(await statusOf(invite.id)).toBe("used");
  });
});

describe("looking a link up for the register page", () => {
  it("names the inviter of a usable link", async () => {
    const invite = await createInvite(db, alice, NOW);

    expect(await findUsableInvite(db, invite.token, NOW)).toEqual({
      usable: true,
      invitedBy: "alice",
    });
  });

  it("says why a link cannot be used", async () => {
    const used = await createInvite(db, alice, NOW);
    await claimInvite(db, used.token, NOW);
    const revoked = await createInvite(db, alice, NOW);
    await revokeInvite(db, alice, revoked.id, NOW);
    const expiring = await createInvite(db, alice, NOW);

    expect(await findUsableInvite(db, "no-such-token", NOW)).toEqual({
      usable: false,
      reason: "missing",
    });
    expect((await findUsableInvite(db, used.token, NOW)).usable).toBe(false);
    expect(await findUsableInvite(db, used.token, NOW)).toMatchObject({
      reason: "used",
    });
    expect(await findUsableInvite(db, revoked.token, NOW)).toMatchObject({
      reason: "revoked",
    });
    expect(
      await findUsableInvite(db, expiring.token, addDays(NOW, 20)),
    ).toMatchObject({ reason: "expired" });
  });
});

describe("claiming", () => {
  it("lets exactly one of two racing sign-ups have the link", async () => {
    const invite = await createInvite(db, alice, NOW);

    const results = await Promise.all([
      claimInvite(db, invite.token, NOW),
      claimInvite(db, invite.token, NOW),
    ]);

    expect(results.filter(Boolean)).toEqual([invite.id]);
  });

  it("refuses an expired or revoked link", async () => {
    const expiring = await createInvite(db, alice, NOW);
    const revoked = await createInvite(db, alice, NOW);
    await revokeInvite(db, alice, revoked.id, NOW);

    expect(await claimInvite(db, expiring.token, addDays(NOW, 14))).toBeNull();
    expect(await claimInvite(db, revoked.token, NOW)).toBeNull();
  });

  it("can be released and claimed again when sign-up fails", async () => {
    const invite = await createInvite(db, alice, NOW);
    await claimInvite(db, invite.token, NOW);

    await releaseInvite(db, invite.token);

    expect(await statusOf(invite.id)).toBe("pending");
    expect(await claimInvite(db, invite.token, NOW)).toBe(invite.id);
  });

  it("is never released once the account exists", async () => {
    const invite = await createInvite(db, alice, NOW);
    const carol = await createUser(db, "carol");
    await claimInvite(db, invite.token, NOW);
    await completeInvite(db, invite.token, carol);

    await releaseInvite(db, invite.token);

    const [row] = await db
      .select()
      .from(invites)
      .where(eq(invites.id, invite.id));
    expect(row?.claimedAt).not.toBeNull();
    expect(row?.usedByUserId).toBe(carol);
  });
});
