import { describe, expect, it } from "vitest";
import {
  compareByUrgency,
  DUE_SOON_DAYS,
  daysUntilDue,
  dueInfo,
  dueStatus,
  nextDueOn,
  toDateString,
  todayInTimeZone,
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

describe("todayInTimeZone", () => {
  const KYIV = "Europe/Kyiv";

  it("reports the reader's calendar day, not the process's", () => {
    // 22:30 UTC on New Year's Eve is already the 2nd in Kyiv. This is the whole
    // reason the helper exists: Vercel runs the cron in UTC.
    const lateEvening = new Date("2026-01-01T22:30:00Z");

    expect(todayInTimeZone(KYIV, lateEvening)).toBe("2026-01-02");
    expect(todayInTimeZone("UTC", lateEvening)).toBe("2026-01-01");
  });

  it("puts the 09:00 UTC cron on the right day in both halves of the year", () => {
    // Kyiv is UTC+2 in winter and UTC+3 in summer, so the job lands at 11:00
    // local in January and 12:00 in June. Different hour, same calendar day —
    // which is the property the digest actually depends on.
    expect(todayInTimeZone(KYIV, new Date("2026-01-15T09:00:00Z"))).toBe(
      "2026-01-15",
    );
    expect(todayInTimeZone(KYIV, new Date("2026-07-15T09:00:00Z"))).toBe(
      "2026-07-15",
    );
  });

  it("survives both daylight-saving switches", () => {
    // Spring forward (2026-03-29) and fall back (2026-10-25), at the half hour
    // either side of midnight UTC where the offset is in play.
    expect(todayInTimeZone(KYIV, new Date("2026-03-28T22:30:00Z"))).toBe(
      "2026-03-29",
    );
    expect(todayInTimeZone(KYIV, new Date("2026-10-24T21:30:00Z"))).toBe(
      "2026-10-25",
    );
  });

  it("pads to a string `parseISO` and the database both accept", () => {
    // Also the canary for a Node build without full ICU: a stripped one ignores
    // `timeZone` and silently answers in UTC.
    const dateString = todayInTimeZone(KYIV, new Date("2026-03-05T12:00:00Z"));

    expect(dateString).toBe("2026-03-05");
    expect(dateString).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
