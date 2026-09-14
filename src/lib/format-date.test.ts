import { describe, expect, it } from "vitest";
import { formatDate } from "~/lib/format-date";

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
