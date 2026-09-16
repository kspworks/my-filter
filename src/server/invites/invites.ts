import { randomBytes } from "node:crypto";
import { addDays } from "date-fns";
import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import {
  INVITE_TTL_DAYS,
  type InviteStatus,
  inviteStatus,
  MAX_OPEN_INVITES,
  type UnusableInviteReason,
} from "~/lib/invites";
import type { DbOrTransaction } from "~/server/db";
import { invites } from "~/server/db/schema/app";
import { user } from "~/server/db/schema/auth";

/**
 * Everything that reads or writes an invite. Every function takes a database
 * handle rather than importing the singleton, so the router, the sign-up gate in
 * `~/server/auth` and `makeTestDb()` all drive the same code.
 *
 * "Now" is a parameter throughout. Expiry is a real instant, not a calendar
 * date, so the server's clock is the right one — but a test needs to move it.
 */

export class InviteLimitError extends Error {
  constructor() {
    super(`At most ${MAX_OPEN_INVITES} open invites`);
    this.name = "InviteLimitError";
  }
}

/** An invite that is neither claimed, revoked nor past its expiry. */
function isOpen(now: Date) {
  return and(
    isNull(invites.claimedAt),
    isNull(invites.revokedAt),
    gt(invites.expiresAt, now),
  );
}

export async function countOpenInvites(
  db: DbOrTransaction,
  userId: string,
  now: Date,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(invites)
    .where(and(eq(invites.userId, userId), isOpen(now)));
  return row?.total ?? 0;
}

/** 32 random bytes: a bearer credential, so unguessable is the whole point. */
function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export type InviteView = {
  id: string;
  token: string;
  status: InviteStatus;
  usedByName: string | null;
  /** Epoch milliseconds — procedures never return `Date` objects. */
  createdAt: number;
  expiresAt: number;
};

export async function createInvite(
  db: DbOrTransaction,
  userId: string,
  now: Date,
): Promise<InviteView> {
  // Counted and inserted in two statements, so two clicks landing together can
  // both pass the check. The cap bounds exposure rather than guarding anything
  // that breaks at six, so that race is not worth a transaction.
  if ((await countOpenInvites(db, userId, now)) >= MAX_OPEN_INVITES) {
    throw new InviteLimitError();
  }

  const [created] = await db
    .insert(invites)
    .values({
      userId,
      token: newToken(),
      expiresAt: addDays(now, INVITE_TTL_DAYS),
      createdAt: now,
    })
    .returning();

  if (!created) throw new Error("Failed to create the invite");

  return {
    id: created.id,
    token: created.token,
    status: inviteStatus(created, now),
    usedByName: null,
    createdAt: created.createdAt.getTime(),
    expiresAt: created.expiresAt.getTime(),
  };
}

/** Newest first. Only the caller's own invites, always. */
export async function listInvites(
  db: DbOrTransaction,
  userId: string,
  now: Date,
): Promise<InviteView[]> {
  const rows = await db
    .select({
      id: invites.id,
      token: invites.token,
      claimedAt: invites.claimedAt,
      revokedAt: invites.revokedAt,
      expiresAt: invites.expiresAt,
      createdAt: invites.createdAt,
      usedByName: user.name,
    })
    .from(invites)
    .leftJoin(user, eq(user.id, invites.usedByUserId))
    .where(eq(invites.userId, userId))
    .orderBy(desc(invites.createdAt));

  return rows.map((row) => ({
    id: row.id,
    token: row.token,
    status: inviteStatus(row, now),
    usedByName: row.usedByName ?? null,
    createdAt: row.createdAt.getTime(),
    expiresAt: row.expiresAt.getTime(),
  }));
}

/**
 * Revokes one of the caller's open invites. Returns `false` for anything else —
 * another user's invite, a used one, an unknown id — and the router turns every
 * one of those into the same `NOT_FOUND`.
 */
export async function revokeInvite(
  db: DbOrTransaction,
  userId: string,
  inviteId: string,
  now: Date,
): Promise<boolean> {
  const revoked = await db
    .update(invites)
    .set({ revokedAt: now })
    .where(
      and(
        eq(invites.id, inviteId),
        eq(invites.userId, userId),
        isNull(invites.claimedAt),
        isNull(invites.revokedAt),
      ),
    )
    .returning({ id: invites.id });
  return revoked.length > 0;
}

export type InviteLookup =
  | { usable: true; invitedBy: string }
  | { usable: false; reason: UnusableInviteReason };

/**
 * What the register page shows for `?invite=…`. Read-only and advisory: the
 * claim at sign-up is what actually decides, so a link that expires between the
 * page loading and the form being sent is still refused.
 */
export async function findUsableInvite(
  db: DbOrTransaction,
  token: string,
  now: Date,
): Promise<InviteLookup> {
  const [row] = await db
    .select({
      claimedAt: invites.claimedAt,
      revokedAt: invites.revokedAt,
      expiresAt: invites.expiresAt,
      invitedBy: user.name,
    })
    .from(invites)
    .innerJoin(user, eq(user.id, invites.userId))
    .where(eq(invites.token, token));

  if (!row) return { usable: false, reason: "missing" };

  const status = inviteStatus(row, now);
  return status === "pending"
    ? { usable: true, invitedBy: row.invitedBy }
    : { usable: false, reason: status };
}

/**
 * Takes the link for one sign-up. A single conditional `UPDATE … RETURNING`, so
 * of two requests racing on the same token exactly one gets a row back — the
 * same claim-first shape as the digest's `notification_log`.
 *
 * Returns the invite id, or `null` if the link is unknown or not open.
 */
export async function claimInvite(
  db: DbOrTransaction,
  token: string,
  now: Date,
): Promise<string | null> {
  const [claimed] = await db
    .update(invites)
    .set({ claimedAt: now })
    .where(and(eq(invites.token, token), isOpen(now)))
    .returning({ id: invites.id });
  return claimed?.id ?? null;
}

/** Records who joined through a claimed link. */
export async function completeInvite(
  db: DbOrTransaction,
  token: string,
  newUserId: string,
): Promise<void> {
  await db
    .update(invites)
    .set({ usedByUserId: newUserId })
    .where(and(eq(invites.token, token), isNull(invites.usedByUserId)));
}

/**
 * Gives a claimed link back when the account was not created after all — a
 * duplicate email, a password the server refused — so one typo does not burn
 * somebody's invite. Never touches a link that already has its account.
 */
export async function releaseInvite(
  db: DbOrTransaction,
  token: string,
): Promise<void> {
  await db
    .update(invites)
    .set({ claimedAt: null })
    .where(and(eq(invites.token, token), isNull(invites.usedByUserId)));
}
