import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextDueOn } from "~/lib/due-date";
import * as schema from "~/server/db/schema";
import { runDailyDigest } from "~/server/notifications/run";
import { saveUserLocale } from "~/server/settings/user-settings";
import { callerFor } from "~/test-utils/caller";
import { createUser, makeTestDb, type TestDb } from "~/test-utils/db";
import { createMemoryTransport } from "~/test-utils/mail";

/**
 * The whole job, end to end: real migrated database, cartridges seeded through
 * the real router, real translator, and a transport that captures what would
 * have gone out.
 *
 * `today` is passed in rather than faked, so these read as "on this date, this
 * happens" and no timer mocking is needed to move a day.
 */

const TODAY = "2026-09-14";
const APP_URL = "https://my-filter.example.com";

let db: TestDb;
let close: () => void;
let alice: string;
let bob: string;
let mail: ReturnType<typeof createMemoryTransport>;

beforeEach(async () => {
  ({ db, close } = await makeTestDb());
  alice = await createUser(db, "alice");
  bob = await createUser(db, "bob");
  mail = createMemoryTransport();
});

afterEach(() => close());

function run(today = TODAY) {
  return runDailyDigest({
    db,
    transport: mail.transport,
    today,
    appUrl: APP_URL,
  });
}

/** Seeds a cartridge whose next due date lands exactly `days` from `on`. */
async function cartridge(
  userId: string,
  days: number,
  { name = "Sediment PP", on = TODAY } = {},
) {
  const caller = await callerFor(db, userId);
  const system = await caller.systems.create({
    manufacturer: "Aquafilter",
    model: "RO-6",
    installedOn: "2026-01-10",
  });
  return caller.consumables.create({
    systemId: system.id,
    type: "sediment",
    name,
    intervalValue: 30,
    intervalUnit: "days",
    lastChangedOn: nextDueOn(on, days - 30, "days"),
  });
}

async function logRows() {
  return db.select().from(schema.notificationLog);
}

describe("when a reminder is due", () => {
  it("says nothing the day before the window opens", async () => {
    await cartridge(alice, 15);

    const summary = await run();

    expect(mail.sent).toEqual([]);
    expect(summary).toMatchObject({ candidates: 0, sent: 0, emails: 0 });
    expect(await logRows()).toEqual([]);
  });

  it("warns on the day it opens", async () => {
    await cartridge(alice, 14);

    const summary = await run();

    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.to).toBe("alice@example.com");
    expect(mail.sent[0]?.subject).toBe(
      "1 cartridge is due for replacement soon",
    );
    expect(summary).toMatchObject({ today: TODAY, sent: 1, emails: 1 });
  });

  it("calls for the replacement on the day itself", async () => {
    await cartridge(alice, 0);

    await run();

    expect(mail.sent[0]?.subject).toBe("1 cartridge needs replacing");
    expect(mail.sent[0]?.text).toContain("due today");
  });

  it("catches up on a warning it never got the chance to send", async () => {
    // A run that failed, a deploy, a cartridge added mid-window: the reminder
    // is late rather than lost, which is the point of matching a window rather
    // than a single day.
    await cartridge(alice, 3);

    await run();

    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.text).toContain("in 3 days");
  });

  it("gives a long-overdue cartridge one notice and then lets it be", async () => {
    await cartridge(alice, -40);

    await run();
    const after = await run();

    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.subject).toBe("1 cartridge needs replacing");
    expect(mail.sent[0]?.text).toContain("40 days overdue");
    // Never a stale warning alongside it, and no daily nagging afterwards.
    expect(mail.sent[0]?.text).not.toContain("Coming up");
    expect(after.emails).toBe(0);
  });
});

describe("saying it only once", () => {
  it("stays quiet on a second run the same day", async () => {
    await cartridge(alice, 0);

    await run();
    const second = await run();

    expect(mail.sent).toHaveLength(1);
    expect(second).toMatchObject({ candidates: 1, sent: 0, emails: 0 });
    expect(await logRows()).toHaveLength(1);
  });

  it("sends the warning and the due notice once each, in one cycle", async () => {
    await cartridge(alice, 14);

    await run(TODAY);
    await run(nextDueOn(TODAY, 14, "days"));

    expect(mail.sent.map((message) => message.subject)).toEqual([
      "1 cartridge is due for replacement soon",
      "1 cartridge needs replacing",
    ]);

    const rows = await logRows();
    expect(rows.map((row) => row.kind).sort()).toEqual(["due", "warning"]);
    // Same cycle, so both rows are keyed on the same due date.
    expect(new Set(rows.map((row) => row.dueOn)).size).toBe(1);
  });

  it("re-arms once the cartridge is actually replaced", async () => {
    const item = await cartridge(alice, 0);
    await run();

    const caller = await callerFor(db, alice);
    await caller.consumables.markReplaced({ id: item.id, changedOn: TODAY });

    // The new cycle's warning falls 16 days out; nothing before then.
    const warnOn = nextDueOn(TODAY, 30 - 14, "days");
    expect((await run(nextDueOn(warnOn, -1, "days"))).emails).toBe(0);
    expect((await run(warnOn)).emails).toBe(1);

    const rows = await logRows();
    expect(new Set(rows.map((row) => row.dueOn)).size).toBe(2);
  });
});

describe("one email per person", () => {
  it("combines replace-now and coming-up into a single message", async () => {
    await cartridge(alice, -3, { name: "RO membrane" });
    await cartridge(alice, 5, { name: "Carbon block" });

    await run();

    expect(mail.sent).toHaveLength(1);
    const body = mail.sent[0]?.text ?? "";
    expect(body.indexOf("Replace now")).toBeLessThan(body.indexOf("Coming up"));
    expect(body.indexOf("RO membrane")).toBeLessThan(
      body.indexOf("Carbon block"),
    );
    expect(mail.sent[0]?.subject).toBe("1 cartridge needs replacing");
  });

  it("never puts one person's cartridges in another's email", async () => {
    await cartridge(alice, 0, { name: "Alice membrane" });
    await cartridge(bob, 0, { name: "Bob membrane" });

    await run();

    expect(mail.sent).toHaveLength(2);
    const forAlice = mail.sent.find((m) => m.to === "alice@example.com");
    const forBob = mail.sent.find((m) => m.to === "bob@example.com");
    expect(forAlice?.text).toContain("Alice membrane");
    expect(forAlice?.text).not.toContain("Bob membrane");
    expect(forBob?.text).toContain("Bob membrane");
    expect(forBob?.text).not.toContain("Alice membrane");
  });

  it("writes to each person in their own language, in the same run", async () => {
    await saveUserLocale(db, bob, "uk");
    await cartridge(alice, 0);
    await cartridge(bob, 0);

    await run();

    const forAlice = mail.sent.find((m) => m.to === "alice@example.com");
    const forBob = mail.sent.find((m) => m.to === "bob@example.com");
    expect(forAlice?.subject).toBe("1 cartridge needs replacing");
    // Alice has no `user_settings` row at all, and still gets readable mail.
    expect(forBob?.subject).toBe("1 картридж потребує заміни");
    expect(forBob?.text).toMatch(/[Ѐ-ӿ]/);
  });
});

describe("when sending fails", () => {
  it("hands the claim back, so the next run retries", async () => {
    await cartridge(alice, 0);
    mail.failNext();

    const summary = await run();

    expect(summary.failures).toMatchObject([{ userId: alice }]);
    expect(summary.emails).toBe(0);
    // Nothing recorded, so the reminder is late rather than lost.
    expect(await logRows()).toEqual([]);

    const retry = await run();
    expect(retry.emails).toBe(1);
    expect(mail.sent).toHaveLength(1);
  });

  it("keeps going for everybody else", async () => {
    await cartridge(alice, 0);
    await cartridge(bob, 0);
    mail.failNext();

    const summary = await run();

    expect(summary.failures).toHaveLength(1);
    expect(mail.sent).toHaveLength(1);
    // Exactly one claim survives: the person whose mail actually went out.
    expect(await logRows()).toHaveLength(1);
  });
});

describe("a quiet day", () => {
  it("sends nothing and records nothing", async () => {
    await cartridge(alice, 90);

    const summary = await run();

    expect(mail.sent).toEqual([]);
    expect(await logRows()).toEqual([]);
    expect(summary).toEqual({
      today: TODAY,
      candidates: 0,
      sent: 0,
      emails: 0,
      failures: [],
    });
  });
});
