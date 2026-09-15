import { timingSafeEqual } from "node:crypto";
import { todayInTimeZone } from "~/lib/due-date";
import { DIGEST_TIME_ZONE } from "~/lib/notifications";
import type { DbOrTransaction } from "~/server/db";
import type { MailTransport } from "~/server/mail/transport";
import { type DigestSummary, runDailyDigest } from "~/server/notifications/run";

/**
 * The daily digest as an HTTP endpoint, kept out of `route.ts` so it can be
 * driven by a real `Request` in a test without importing the database
 * singleton. The route file is the injector and nothing else.
 */

export type DigestDeps = {
  db: DbOrTransaction;
  transport: MailTransport;
  cronSecret: string | undefined;
  appUrl: string;
  /** Overridden in tests to pin the calendar day. */
  now?: Date;
};

/**
 * Vercel sends `Authorization: Bearer $CRON_SECRET` once the variable is set on
 * the project. Constant-time, and closed by default: with no secret configured
 * every caller is refused, which is the right posture for a deploy nobody has
 * finished setting up.
 */
export function isAuthorizedCron(
  header: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !header) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function handleDigestRequest(
  request: Request,
  deps: DigestDeps,
): Promise<Response> {
  if (
    !isAuthorizedCron(request.headers.get("authorization"), deps.cronSecret)
  ) {
    // No detail and no hint the route exists.
    return new Response("Unauthorized", { status: 401 });
  }

  const today = todayInTimeZone(DIGEST_TIME_ZONE, deps.now ?? new Date());

  let summary: DigestSummary;
  try {
    summary = await runDailyDigest({
      db: deps.db,
      transport: deps.transport,
      today,
      appUrl: deps.appUrl,
    });
  } catch (error) {
    console.error("[cron/digest]", error);
    return Response.json({ today, error: "digest failed" }, { status: 500 });
  }

  // A partial failure answers 500 on purpose. The cron log is the only
  // monitoring this has, and a green tick on a run that delivered nothing is
  // worse than no tick at all.
  return Response.json(summary, {
    status: summary.failures.length > 0 ? 500 : 200,
  });
}
