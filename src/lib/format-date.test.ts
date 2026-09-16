import { describe, expect, it } from "vitest";
import { duePhraseMessage, formatDate, formatInstant } from "~/lib/format-date";

/**
 * The only module allowed to format a date for a person. The `yyyy-MM-dd`
 * pattern in `due-date.ts` is machine serialization and is deliberately never
 * localized; this is the other side of that rule.
 */

describe("formatDate", () => {
  it("renders English day-first, not the American month-first order", () => {
    expect(formatDate("2026-01-10", "en")).toBe("10 Jan 2026");
    expect(formatDate("2026-12-31", "en")).toBe("31 Dec 2026");
  });

  it("renders Ukrainian month names", () => {
    expect(formatDate("2026-01-10", "uk")).toMatch(/^10 .*2026$/);
    expect(formatDate("2026-01-10", "uk")).toMatch(/[Ѐ-ӿ]/);
  });

  it("keeps the calendar day a date-only string names", () => {
    // `new Date("2026-01-01")` would parse as UTC midnight and render as the
    // 31st of December west of Greenwich. `parseISO` is what prevents that.
    expect(formatDate("2026-01-01", "en")).toBe("1 Jan 2026");
    expect(formatDate("2026-03-01", "en")).toBe("1 Mar 2026");
    expect(formatDate("2026-12-31", "en")).toBe("31 Dec 2026");
  });
});

describe("formatInstant", () => {
  it("renders an instant in the same pattern, on the reader's own day", () => {
    // Local noon, so the day is the same in every timezone the suite runs in.
    const noon = new Date(2026, 8, 30, 12).getTime();

    expect(formatInstant(noon, "en")).toBe("30 Sep 2026");
    expect(formatInstant(noon, "uk")).toMatch(/^30 .*2026$/);
  });
});

describe("duePhraseMessage", () => {
  it("picks the message a day count needs, and the count to give it", () => {
    expect(duePhraseMessage(0)).toEqual({ key: "today", count: 0 });
    expect(duePhraseMessage(5)).toEqual({ key: "upcoming", count: 5 });
    // "3 days overdue" counts up from zero, so the sign is dropped here rather
    // than in every caller — and never inside a message, where the plural rule
    // would then be reasoning about a negative.
    expect(duePhraseMessage(-3)).toEqual({ key: "overdue", count: 3 });
  });
});
