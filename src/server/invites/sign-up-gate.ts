import { APIError, createAuthMiddleware } from "better-auth/api";
import type { DbOrTransaction } from "~/server/db";
import {
  claimInvite,
  completeInvite,
  releaseInvite,
} from "~/server/invites/invites";

/**
 * Invite-only registration, as a pair of better-auth hooks on `/sign-up/email`.
 *
 * Claim, then create, then complete — or release the claim when the account was
 * not created, so a duplicate email or a refused password does not burn a link.
 * The `before` hook runs ahead of better-auth's own checks and the `after` hook
 * runs even when the endpoint threw, which is what makes that pairing safe.
 *
 * The token travels as an extra `inviteToken` key on the sign-up body: the
 * library's body schema accepts unknown keys and its field parser ignores them.
 * Nothing is carried between the hooks, so the `after` hook just reads it again.
 *
 * **Only HTTP requests are gated.** `scripts/seed.ts` creates the demo account
 * through `auth.api.signUpEmail` from a trusted shell, with no request at all,
 * and must keep working on an invite-only deploy. Every browser sign-up arrives
 * through the route handler, which always carries one.
 *
 * `inviteOnly` is a function rather than a boolean so a test can drive both
 * modes through one instance.
 */

const SIGN_UP_PATH = "/sign-up/email";

export const INVITE_REQUIRED = "INVITE_REQUIRED";

function inviteTokenOf(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const token = (body as Record<string, unknown>).inviteToken;
  return typeof token === "string" && token.length > 0 ? token : null;
}

export function createSignUpGate({
  db,
  inviteOnly,
  now = () => new Date(),
}: {
  db: DbOrTransaction;
  inviteOnly: () => boolean;
  now?: () => Date;
}) {
  const applies = (ctx: { path?: string; request?: Request }) =>
    ctx.path === SIGN_UP_PATH && !!ctx.request && inviteOnly();

  return {
    before: createAuthMiddleware(async (ctx) => {
      if (!applies(ctx)) return;

      const token = inviteTokenOf(ctx.body);
      if (!token || !(await claimInvite(db, token, now()))) {
        throw new APIError("FORBIDDEN", {
          code: INVITE_REQUIRED,
          message: "Registration requires a valid invite link",
        });
      }
    }),

    after: createAuthMiddleware(async (ctx) => {
      if (!applies(ctx)) return;

      const token = inviteTokenOf(ctx.body);
      if (!token) return;

      const newUserId = ctx.context.newSession?.user.id;
      try {
        if (newUserId) {
          await completeInvite(db, token, newUserId);
        } else {
          await releaseInvite(db, token);
        }
      } catch (error) {
        // The account exists either way; a bookkeeping failure must not turn a
        // successful sign-up into an error page.
        console.error("[invites] could not settle the invite claim", error);
      }
    }),
  };
}
