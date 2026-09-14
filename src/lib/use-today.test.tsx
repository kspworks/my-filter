import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToday } from "~/lib/use-today";
import { screen, setupApp, type TestApp, userEvent } from "~/test-utils/render";

/**
 * "Today" is computed in the browser, never on the server, because the server's
 * timezone is not the user's. It is also captured once per mount, so a tab left
 * open overnight does not silently reshuffle every due date mid-session.
 */

let app: TestApp;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  app = await setupApp();
});

afterEach(() => {
  vi.useRealTimers();
  app.close();
});

function Today() {
  const [, bump] = useState(0);
  return (
    <>
      <output>{useToday()}</output>
      <button type="button" onClick={() => bump((n) => n + 1)}>
        re-render
      </button>
    </>
  );
}

describe("useToday", () => {
  it("reports the local calendar day, not the UTC one", () => {
    // Late evening local: reading this as UTC would report tomorrow.
    vi.setSystemTime(new Date(2026, 8, 14, 23, 30));
    app.render(<Today />);

    expect(screen.getByRole("status")).toHaveTextContent("2026-09-14");
  });

  it("does not drift to yesterday just after midnight", () => {
    vi.setSystemTime(new Date(2026, 8, 14, 0, 30));
    app.render(<Today />);

    expect(screen.getByRole("status")).toHaveTextContent("2026-09-14");
  });

  it("holds the date it was mounted with, even as the clock rolls over", async () => {
    const actor = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.setSystemTime(new Date(2026, 8, 14, 23, 59));
    app.render(<Today />);

    vi.setSystemTime(new Date(2026, 8, 15, 0, 1));
    await actor.click(screen.getByRole("button", { name: "re-render" }));

    // A due date must not shift under the user mid-session.
    expect(screen.getByRole("status")).toHaveTextContent("2026-09-14");
  });
});
