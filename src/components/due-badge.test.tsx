import { afterEach, describe, expect, it } from "vitest";
import { DueBadge } from "~/components/due-badge";
import { screen, setupApp, type TestApp } from "~/test-utils/render";

/**
 * The badge is where the plural rules actually reach a user. Ukrainian has four
 * categories to English's two, and its "one" category includes 21 — which is
 * why counts go through ICU rather than a `=== 1` check anywhere in the app.
 */

let app: TestApp;

afterEach(() => app?.close());

async function renderBadge(
  locale: "en" | "uk",
  daysUntilDue: number,
  status: "overdue" | "due_soon" | "ok",
) {
  app = await setupApp({ locale });
  app.render(<DueBadge status={status} daysUntilDue={daysUntilDue} />);
}

describe("English", () => {
  it("names the day it is due", async () => {
    await renderBadge("en", 0, "due_soon");
    expect(screen.getByText("due today")).toBeInTheDocument();
  });

  it("counts days ahead and days late", async () => {
    await renderBadge("en", 5, "ok");
    expect(screen.getByText("in 5 days")).toBeInTheDocument();

    app.close();
    await renderBadge("en", 1, "due_soon");
    expect(screen.getByText("in 1 day")).toBeInTheDocument();

    app.close();
    await renderBadge("en", -3, "overdue");
    expect(screen.getByText("3 days overdue")).toBeInTheDocument();
  });

  it("labels the status for a screen reader and on hover", async () => {
    await renderBadge("en", -3, "overdue");
    expect(screen.getByText("3 days overdue")).toHaveAttribute(
      "title",
      "Overdue",
    );
  });
});

describe("Ukrainian", () => {
  it.each([
    [1, "через 1 день"],
    [3, "через 3 дні"],
    [5, "через 5 днів"],
    [11, "через 11 днів"],
    // 21 is "one" under CLDR, which is the case a hand-rolled plural gets wrong.
    [21, "через 21 день"],
    [22, "через 22 дні"],
  ])("declines %i days ahead", async (days, expected) => {
    await renderBadge("uk", days, "ok");
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("declines overdue days too", async () => {
    await renderBadge("uk", -1, "overdue");
    expect(screen.getByText(/1 день/)).toBeInTheDocument();

    app.close();
    await renderBadge("uk", -5, "overdue");
    expect(screen.getByText(/5 днів/)).toBeInTheDocument();
  });
});
