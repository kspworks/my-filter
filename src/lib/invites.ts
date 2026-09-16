/**
 * Domain vocabulary for invite links.
 *
 * Pure on purpose: the router, the sign-up gate and the Invites page all read
 * these, and the page is a client component. `InviteStatus` is a stable key —
 * the catalogue turns it into a badge, never the database.
 */

/** An unused link stops working this long after it was created. */
export const INVITE_TTL_DAYS = 14;

/**
 * How many open invites — neither used, revoked nor expired — one person may
 * hold at a time. A cap on *open* links rather than on links ever created, so
 * inviting people is never used up; it only bounds what a leaked batch exposes.
 */
export const MAX_OPEN_INVITES = 5;

export const INVITE_STATUSES = [
  "pending",
  "used",
  "revoked",
  "expired",
] as const;

export type InviteStatus = (typeof INVITE_STATUSES)[number];

/** Why a link cannot be used: a status other than `pending`, or no such link. */
export type UnusableInviteReason = Exclude<InviteStatus, "pending"> | "missing";

/**
 * The one place an invite's state is decided. `claimedAt` rather than
 * `usedByUserId`, because a claim is taken before the account exists — a link
 * mid-sign-up is already spoken for.
 *
 * Used beats revoked beats expired: once somebody has joined through a link,
 * that is the fact worth showing.
 */
export function inviteStatus(
  invite: { claimedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date,
): InviteStatus {
  if (invite.claimedAt) return "used";
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt.getTime() <= now.getTime()) return "expired";
  return "pending";
}

/** The shareable link. Built on the client, so it is always the viewer's origin. */
export function inviteUrl(origin: string, token: string): string {
  return `${origin}/register?invite=${encodeURIComponent(token)}`;
}
