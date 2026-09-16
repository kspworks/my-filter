import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// `src/env.ts` is evaluated once, at import, so the switch has to be flipped
// before anything imports it. Vitest isolates files, so `auth.test.ts` keeps
// running the default, open-registration configuration.
vi.hoisted(() => {
  process.env.INVITE_ONLY = "true";
});

const { auth } = await import("~/server/auth");
const { db } = await import("~/server/db");
const schema = await import("~/server/db/schema");
const { createInvite } = await import("~/server/invites/invites");

/**
 * The invite gate against the *real* better-auth instance and route handler.
 *
 * `sign-up-gate.ts` leans on three things the library does rather than
 * promises: an unknown body key survives to the hooks, `after` hooks run when
 * the endpoint threw, and a direct `auth.api` call carries no `request`. An
 * upgrade that changes any of them breaks invite-only registration silently —
 * either letting everyone in or burning links — so each is pinned here.
 */

const CREDENTIALS = {
  name: "Newcomer",
  email: "newcomer@example.com",
  password: "correct-horse-battery",
};

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

beforeEach(async () => {
  await db.delete(schema.invites);
  await db.delete(schema.session);
  await db.delete(schema.account);
  await db.delete(schema.userSettings);
  await db.delete(schema.user);
});

/** Through the route handler, exactly as the register form's request arrives. */
async function signUpOverHttp(body: Record<string, unknown>) {
  const response = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({ ...CREDENTIALS, ...body }),
    }),
  );
  const json = (await response.json()) as { code?: string };
  return { status: response.status, code: json.code };
}

async function inviter() {
  const { user } = await auth.api.signUpEmail({
    body: {
      name: "Inviter",
      email: "inviter@example.com",
      password: "correct-horse-battery",
    },
  });
  return user.id;
}

async function readInvite(id: string) {
  const [row] = await db
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.id, id));
  return row;
}

async function userCount() {
  return (await db.select().from(schema.user)).length;
}

describe("registration while invite-only", () => {
  it("refuses a sign-up with no invite", async () => {
    const result = await signUpOverHttp({});

    expect(result).toEqual({ status: 403, code: "INVITE_REQUIRED" });
    expect(await userCount()).toBe(0);
  });

  it("refuses a made-up token", async () => {
    const result = await signUpOverHttp({ inviteToken: "not-a-real-token" });

    expect(result.code).toBe("INVITE_REQUIRED");
    expect(await userCount()).toBe(0);
  });

  it("creates the account and records who joined through the link", async () => {
    const invite = await createInvite(db, await inviter(), new Date());

    const result = await signUpOverHttp({ inviteToken: invite.token });

    expect(result.status).toBe(200);
    const [joined] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, CREDENTIALS.email));
    const row = await readInvite(invite.id);
    expect(row?.claimedAt).not.toBeNull();
    expect(row?.usedByUserId).toBe(joined?.id);
  });

  it("lets a link be used once", async () => {
    const invite = await createInvite(db, await inviter(), new Date());
    await signUpOverHttp({ inviteToken: invite.token });

    const second = await signUpOverHttp({
      inviteToken: invite.token,
      email: "second@example.com",
    });

    expect(second.code).toBe("INVITE_REQUIRED");
    // The refused request must not have released the first one's claim.
    expect((await readInvite(invite.id))?.usedByUserId).not.toBeNull();
  });

  it("gives the link back when the account could not be created", async () => {
    const invite = await createInvite(db, await inviter(), new Date());

    // The gate claims before better-auth checks the email, so the duplicate is
    // refused *after* the link was taken — and must not burn it.
    const duplicate = await signUpOverHttp({
      inviteToken: invite.token,
      email: "inviter@example.com",
    });

    expect(duplicate.status).toBe(422);
    expect((await readInvite(invite.id))?.claimedAt).toBeNull();

    const retry = await signUpOverHttp({ inviteToken: invite.token });
    expect(retry.status).toBe(200);
  });

  it("refuses a revoked or expired link", async () => {
    const owner = await inviter();
    const revoked = await createInvite(db, owner, new Date());
    await db
      .update(schema.invites)
      .set({ revokedAt: new Date() })
      .where(eq(schema.invites.id, revoked.id));
    const expired = await createInvite(db, owner, new Date(2020, 0, 1));

    expect((await signUpOverHttp({ inviteToken: revoked.token })).code).toBe(
      "INVITE_REQUIRED",
    );
    expect((await signUpOverHttp({ inviteToken: expired.token })).code).toBe(
      "INVITE_REQUIRED",
    );
  });

  it("leaves trusted server-side sign-ups alone", async () => {
    // `scripts/seed.ts` creates the demo account this way on an invite-only
    // deploy, from a shell that has no invite to offer.
    await expect(inviter()).resolves.toEqual(expect.any(String));
    expect(await userCount()).toBe(1);
  });
});
