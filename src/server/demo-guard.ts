import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { DEMO_EMAIL } from "~/lib/demo";

/**
 * The demo account's password is published, so anyone can sign in to it. Without
 * this, the first visitor could change that password and lock everyone else out,
 * rename it, or delete it. `invites.create` refuses it for the same reason.
 *
 * A plugin rather than one more thing in `hooks.before`, which belongs to the
 * invite gate: plugin hooks run alongside it, so neither has to know about the
 * other.
 */

const GUARDED_PATHS = new Set([
  "/change-password",
  "/update-user",
  "/delete-user",
]);

export const DEMO_ACCOUNT = "DEMO_ACCOUNT";

export function demoGuard() {
  return {
    id: "demo-guard",
    hooks: {
      before: [
        {
          matcher: (ctx) => GUARDED_PATHS.has(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx);
            if (session?.user.email === DEMO_EMAIL) {
              throw new APIError("FORBIDDEN", {
                code: DEMO_ACCOUNT,
                message: "The demo account cannot be changed",
              });
            }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
