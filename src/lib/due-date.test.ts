import { describe, expect, it } from "vitest";
import {
  compareByUrgency,
  DUE_SOON_DAYS,
  daysUntilDue,
  dueInfo,
  dueStatus,
  nextDueOn,
  toDateString,
} from "~/lib/due-date";

describe("nextDueOn", () => {
  it("adds whole months", () => {
    expect(nextDueOn("2026-01-15", 3, "months")).toBe("2026-04-15");
    expect(nextDueOn("2026-01-15", 12, "months")).toBe("2027-01-15");
  });

  it("adds days", () => {
    expect(nextDueOn("2026-01-15", 30, "days")).toBe("2026-02-14");
  });

  it("clamps month-ends instead of overflowing into the next month", () => {
    // Jan 31 + 1 month is Feb 28, not Mar 3. Pinned deliberately: a "monthly"
    // filter installed on the 31st should stay at month-end, not drift forward.
    expect(nextDueOn("2026-01-31", 1, "months")).toBe("2026-02-28");
    expect(nextDueOn("2028-01-31", 1, "months")).toBe("2028-02-29");
  });

  it("crosses a DST boundary without losing a day", () => {
    // Europe/Kyiv and most of the EU spring forward on the last Sunday of March.
    expect(nextDueOn("2026-03-01", 1, "months")).toBe("2026-04-01");
    expect(nextDueOn("2026-03-01", 31, "days")).toBe("2026-04-01");
  });
});

describe("daysUntilDue", () => {
  it("counts calendar days in both directions", () => {
    expect(daysUntilDue("2026-09-20", "2026-09-14")).toBe(6);
    expect(daysUntilDue("2026-09-14", "2026-09-14")).toBe(0);
    expect(daysUntilDue("2026-09-01", "2026-09-14")).toBe(-13);
  });

  it("is unaffected by a DST transition in between", () => {
    expect(daysUntilDue("2026-04-01", "2026-03-01")).toBe(31);
    expect(daysUntilDue("2026-11-05", "2026-10-05")).toBe(31);
  });
});

describe("dueStatus", () => {
  it("separates overdue, due soon and on schedule at the boundaries", () => {
    expect(dueStatus("2026-09-13", "2026-09-14")).toBe("overdue");
    expect(dueStatus("2026-09-14", "2026-09-14")).toBe("due_soon");
    expect(dueStatus("2026-09-28", "2026-09-14")).toBe("due_soon");
    expect(daysUntilDue("2026-09-28", "2026-09-14")).toBe(DUE_SOON_DAYS);
    expect(dueStatus("2026-09-29", "2026-09-14")).toBe("ok");
  });
});

describe("dueInfo", () => {
  it("reports the schedule for a consumable", () => {
    expect(
      dueInfo(
        {
          lastChangedOn: "2026-06-14",
          intervalValue: 3,
          intervalUnit: "months",
        },
        "2026-09-14",
      ),
    ).toEqual({
      nextDueOn: "2026-09-14",
      daysUntilDue: 0,
      status: "due_soon",
    });
  });

  it("orders the most urgent item first", () => {
    const today = "2026-09-14";
    const overdue = dueInfo(
      { lastChangedOn: "2026-01-01", intervalValue: 3, intervalUnit: "months" },
      today,
    );
    const later = dueInfo(
      {
        lastChangedOn: "2026-09-01",
        intervalValue: 12,
        intervalUnit: "months",
      },
      today,
    );
    expect([later, overdue].sort(compareByUrgency)[0]).toBe(overdue);
  });
});

describe("toDateString", () => {
  it("uses the local calendar day, not UTC", () => {
    // 23:30 local on the 14th must not be reported as the 15th (or the 13th).
    const localLateEvening = new Date(2026, 8, 14, 23, 30, 0);
    expect(toDateString(localLateEvening)).toBe("2026-09-14");
    const localEarlyMorning = new Date(2026, 8, 14, 0, 30, 0);
    expect(toDateString(localEarlyMorning)).toBe("2026-09-14");
  });
});
