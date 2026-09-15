import { env } from "~/env";
import { db } from "~/server/db";
import { createMailTransport } from "~/server/mail";
import { handleDigestRequest } from "~/server/notifications/cron";

/**
 * Wired to `vercel.json`'s `0 9 * * *`. Everything worth testing is in
 * `~/server/notifications/cron`; this file only supplies the real database,
 * the real transport and the real environment.
 */

// The Gmail handshake and AUTH cost a second or three before any mail moves.
// Explicit so a plan change never silently alters the budget.
export const maxDuration = 60;

export async function GET(request: Request) {
  const transport = await createMailTransport();
  try {
    return await handleDigestRequest(request, {
      db,
      transport,
      cronSecret: env.CRON_SECRET,
      appUrl: env.BETTER_AUTH_URL,
    });
  } finally {
    await transport.close?.();
  }
}
