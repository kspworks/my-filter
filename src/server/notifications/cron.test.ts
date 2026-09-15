import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextDueOn, todayInTimeZone } from "~/lib/due-date";
import { DIGEST_TIME_ZONE } from "~/lib/notifications";
import {
  type DigestDeps,
  handleDigestRequest,
  isAuthorizedCron,
} from "~/server/notifications/cron";
import type { DigestSummary } from "~/server/notifications/run";
import { callerFor } from "~/test-utils/caller";
import { createUser, makeTestDb, type TestDb } from "~/test-utils/db";
import { createMemoryTransport } from "~/test-utils/mail";

/**
 * The endpoint Vercel calls, driven with real `Request` objects. Everything
 * below the auth check is the same code `run.test.ts` covers; what is new here
 * is the gate, the status codes and the fact that the calendar day is resolved
 * in Kyiv rather than wherever the process happens to be.
 */

const SECRET = "cron-secret-cron-secret";
const APP_URL = "https://my-filter.example.com";

let db: TestDb;
let close: () => void;
let alice: string;
let mail: ReturnType<typeof createMemoryTransport>;

beforeEach(async () => {
  ({ db, close } = await makeTestDb());
  alice = await createUser(db, "alice");
  mail = createMemoryTransport();
});

afterEach(() => close());

function request(authorization?: string) {
  return new Request("https://my-filter.example.com/api/cron/digest", {
    headers: authorization ? { authorization } : {},
  });
}

function deps(overrides: Partial<DigestDeps> = {}): DigestDeps {
  return {
    db,
    transport: mail.transport,
    cronSecret: SECRET,
    appUrl: APP_URL,
    ...overrides,
  };
}

/** A cartridge due exactly on the Kyiv day `now` falls in. */
async function cartridgeDueOn(now: Date) {
  const today = todayInTimeZone(DIGEST_TIME_ZONE, now);
  const caller = await callerFor(db, alice);
  const system = await caller.systems.create({
    manufacturer: "Aquafilter",
    model: "RO-6",
    installedOn: "2025-01-10",
  });
  return caller.consumables.create({
    systemId: system.id,
    type: "sediment",
    name: "Sediment PP",
    intervalValue: 30,
    intervalUnit: "days",
    lastChangedOn: nextDueOn(today, -30, "days"),
  });
}

describe("isAuthorizedCron", () => {
  it("accepts the bearer Vercel sends", () => {
    expect(isAuthorizedCron(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("rejects a wrong secret, a wrong scheme and a missing header", () => {
    expect(isAuthorizedCron("Bearer nope-nope-nope-nope", SECRET)).toBe(false);
    expect(isAuthorizedCron(`Basic ${SECRET}`, SECRET)).toBe(false);
    expect(isAuthorizedCron(SECRET, SECRET)).toBe(false);
    expect(isAuthorizedCron(null, SECRET)).toBe(false);
  });

  it("refuses everything when no secret is configured", () => {
    // Stated as a test because it looks like a bug until you know it is not: a
    // deploy that has not been given a secret must be shut, not open.
    expect(isAuthorizedCron(`Bearer ${SECRET}`, undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
  });
});

describe("the endpoint", () => {
  it("401s without a valid bearer, and sends nothing", async () => {
    await cartridgeDueOn(new Date());

    for (const header of [undefined, "Bearer wrong-wrong-wrong-wrong"]) {
      const response = await handleDigestRequest(request(header), deps());
      expect(response.status).toBe(401);
    }
    expect(mail.sent).toEqual([]);
  });

  it("401s when the deploy has no secret, even with a header", async () => {
    const response = await handleDigestRequest(
      request(`Bearer ${SECRET}`),
      deps({ cronSecret: undefined }),
    );

    expect(response.status).toBe(401);
  });

  it("sends the mail and reports what it did", async () => {
    const now = new Date("2026-09-14T09:00:00Z");
    await cartridgeDueOn(now);

    const response = await handleDigestRequest(
      request(`Bearer ${SECRET}`),
      deps({ now }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()) as DigestSummary).toMatchObject({
      today: "2026-09-14",
      candidates: 1,
      sent: 1,
      emails: 1,
      failures: [],
    });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.to).toBe("alice@example.com");
  });

  it("reports the reader's calendar day, not the server's", async () => {
    // 22:30 UTC is already tomorrow in Kyiv. Asserted at the HTTP boundary as
    // well as in `todayInTimeZone`, because this is the wiring that decides it.
    const now = new Date("2026-01-01T22:30:00Z");

    const response = await handleDigestRequest(
      request(`Bearer ${SECRET}`),
      deps({ now }),
    );

    expect(((await response.json()) as DigestSummary).today).toBe("2026-01-02");
  });

  it("stays quiet when called twice the same day", async () => {
    const now = new Date("2026-09-14T09:00:00Z");
    await cartridgeDueOn(now);

    await handleDigestRequest(request(`Bearer ${SECRET}`), deps({ now }));
    const second = await handleDigestRequest(
      request(`Bearer ${SECRET}`),
      deps({ now }),
    );

    // Idempotency over HTTP, not just inside the function: Vercel retries.
    expect(((await second.json()) as DigestSummary).emails).toBe(0);
    expect(mail.sent).toHaveLength(1);
  });

  it("answers 500 when a send failed, so the cron log goes red", async () => {
    const now = new Date("2026-09-14T09:00:00Z");
    await cartridgeDueOn(now);
    mail.failNext();

    const response = await handleDigestRequest(
      request(`Bearer ${SECRET}`),
      deps({ now }),
    );

    expect(response.status).toBe(500);
    expect(((await response.json()) as DigestSummary).failures).toHaveLength(1);
  });
});
