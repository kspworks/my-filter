import { describe, expect, it } from "vitest";
import { nextDueOn } from "~/lib/due-date";
import {
  type NotifiableRow,
  planDigests,
  selectNotices,
} from "~/server/notifications/select";

/**
 * The trigger rule, with no database in sight. Two reminders per replacement
 * cycle: one fourteen days out, one when the date arrives.
 */

const TODAY = "2026-09-14";

function row(overrides: Partial<NotifiableRow> = {}): NotifiableRow {
  return {
    consumableId: "c1",
    name: "Sediment PP",
    intervalValue: 30,
    intervalUnit: "days",
    lastChangedOn: "2026-08-15",
    systemManufacturer: "Aquafilter",
    systemModel: "RO-6",
    userId: "u1",
    email: "alice@example.com",
    locale: "en",
    ...overrides,
  };
}

/** A row whose next due date lands exactly `days` from `TODAY`. */
function dueIn(days: number, overrides: Partial<NotifiableRow> = {}) {
  return row({
    intervalUnit: "days",
    intervalValue: 30,
    lastChangedOn: nextDueOn(TODAY, days - 30, "days"),
    ...overrides,
  });
}

describe("selectNotices", () => {
  it("warns the day the fourteen-day window opens, and not before", () => {
    expect(selectNotices([dueIn(15)], TODAY)).toEqual([]);
    expect(selectNotices([dueIn(14)], TODAY)).toMatchObject([
      { kind: "warning", daysUntilDue: 14 },
    ]);
    expect(selectNotices([dueIn(13)], TODAY)).toMatchObject([
      { kind: "warning", daysUntilDue: 13 },
    ]);
    expect(selectNotices([dueIn(1)], TODAY)).toMatchObject([
      { kind: "warning", daysUntilDue: 1 },
    ]);
  });

  it("calls for a replacement on the day itself and after", () => {
    expect(selectNotices([dueIn(0)], TODAY)).toMatchObject([
      { kind: "due", daysUntilDue: 0 },
    ]);
    expect(selectNotices([dueIn(-1)], TODAY)).toMatchObject([
      { kind: "due", daysUntilDue: -1 },
    ]);
  });

  it("gives a long-overdue cartridge one notice, never two", () => {
    // It is past both thresholds at once. Warning somebody about a cartridge
    // they should already have replaced is noise, so only the urgent one fires.
    const notices = selectNotices([dueIn(-60)], TODAY);

    expect(notices).toHaveLength(1);
    expect(notices[0]?.kind).toBe("due");
  });

  it("reports the due date the log will be keyed on", () => {
    const item = row({
      lastChangedOn: "2026-03-14",
      intervalValue: 6,
      intervalUnit: "months",
    });

    expect(selectNotices([item], TODAY)[0]?.dueOn).toBe(
      nextDueOn("2026-03-14", 6, "months"),
    );
  });

  it("names the system, or nothing at all for the unassigned shelf", () => {
    expect(selectNotices([dueIn(0)], TODAY)[0]?.system).toBe("Aquafilter RO-6");
    expect(
      selectNotices(
        [dueIn(0, { systemManufacturer: null, systemModel: null })],
        TODAY,
      )[0]?.system,
    ).toBeNull();
  });
});

describe("planDigests", () => {
  it("puts replace-now before coming-up, most urgent first within each", () => {
    const digests = planDigests(
      [
        dueIn(5, { consumableId: "soon" }),
        dueIn(-10, { consumableId: "very-overdue" }),
        dueIn(14, { consumableId: "later" }),
        dueIn(0, { consumableId: "today" }),
      ],
      TODAY,
    );

    expect(digests).toHaveLength(1);
    expect(digests[0]?.notices.map((n) => n.consumableId)).toEqual([
      "very-overdue",
      "today",
      "soon",
      "later",
    ]);
  });

  it("gives each person their own digest and nobody else's rows", () => {
    const digests = planDigests(
      [
        dueIn(0, {
          userId: "u1",
          email: "alice@example.com",
          consumableId: "a",
        }),
        dueIn(0, { userId: "u2", email: "bob@example.com", consumableId: "b" }),
      ],
      TODAY,
    );

    expect(digests).toHaveLength(2);
    const alice = digests.find((d) => d.userId === "u1");
    expect(alice?.email).toBe("alice@example.com");
    expect(alice?.notices.map((n) => n.consumableId)).toEqual(["a"]);
  });

  it("skips people with nothing due", () => {
    expect(planDigests([dueIn(90)], TODAY)).toEqual([]);
  });

  it("resolves the language, falling back when there is none recorded", () => {
    const locale = (value: string | null) =>
      planDigests([dueIn(0, { locale: value })], TODAY)[0]?.locale;

    expect(locale("uk")).toBe("uk");
    expect(locale(null)).toBe("en");
    expect(locale("klingon")).toBe("en");
  });
});
