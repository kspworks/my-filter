import { expect, test } from "@playwright/test";
import { E2E_CRON_SECRET } from "../playwright.config";

/**
 * The daily digest as Vercel actually calls it: a GET against a production
 * build, with the bearer token the platform injects.
 *
 * Everything below the HTTP layer is covered by `src/server/notifications/*`
 * against an in-memory database. What only exists here is the wiring — that the
 * route is deployed at the path `vercel.json` names, that `CRON_SECRET` reaches
 * it from the environment, and that the transport and database singletons are
 * built without blowing up under the React Compiler build.
 */

const ENDPOINT = "/api/cron/digest";

test("refuses a request without the cron secret", async ({ request }) => {
  const response = await request.get(ENDPOINT);

  expect(response.status()).toBe(401);
});

test("refuses a request bearing the wrong secret", async ({ request }) => {
  const response = await request.get(ENDPOINT, {
    headers: { authorization: "Bearer not-the-secret-not-the-secret" },
  });

  expect(response.status()).toBe(401);
});

test("runs the digest for the platform's bearer token", async ({ request }) => {
  const response = await request.get(ENDPOINT, {
    headers: { authorization: `Bearer ${E2E_CRON_SECRET}` },
  });

  expect(response.status()).toBe(200);
  const summary = (await response.json()) as {
    today: string;
    emails: number;
    failures: unknown[];
  };
  // The calendar day is resolved in Kyiv by the route itself, so this is a real
  // date whatever timezone the runner is in.
  expect(summary.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(summary.failures).toEqual([]);

  // Whatever the first call sent, a second one the same day sends nothing:
  // idempotency against the real SQLite file, not an in-memory one.
  const again = await request.get(ENDPOINT, {
    headers: { authorization: `Bearer ${E2E_CRON_SECRET}` },
  });
  expect(((await again.json()) as { emails: number }).emails).toBe(0);
});
