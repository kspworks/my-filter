import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsumableRow } from "~/components/consumable-row";
import {
  screen,
  setupApp,
  type TestApp,
  userEvent,
  waitFor,
} from "~/test-utils/render";

/**
 * The busiest component in the app, and the one place where a click travels the
 * whole way down: react-query -> tRPC -> the real router -> a transaction in
 * SQLite -> invalidation -> a re-render. The Radix dropdown and popover paths
 * are covered by `e2e/interactions.spec.ts` instead; jsdom's pointer-event
 * gaps make them flaky for reasons that have nothing to do with the app.
 */

const TODAY = "2026-09-14";

let app: TestApp;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  app = await setupApp();
});

afterEach(() => {
  vi.useRealTimers();
  app.close();
});

async function aRow({
  lastChangedOn = "2026-01-10",
  withSystem = false,
  showSystem = false,
} = {}) {
  const system = withSystem
    ? await app.caller.systems.create({
        manufacturer: "Aquafilter",
        model: "RO-6",
        installedOn: "2026-01-10",
      })
    : undefined;
  await app.caller.consumables.create({
    systemId: system?.id,
    type: "sediment",
    name: "Sediment PP",
    intervalValue: 6,
    intervalUnit: "months",
    lastChangedOn,
  });

  const [consumable] = await app.caller.consumables.list();
  const systems = await app.caller.systems.list();
  if (!consumable) throw new Error("fixture did not create a consumable");

  app.render(
    <ConsumableRow
      consumable={consumable}
      today={TODAY}
      systems={systems}
      showSystem={showSystem}
    />,
  );
  return { consumable, system };
}

describe("what it shows", () => {
  it("names the cartridge, its type and its schedule", async () => {
    await aRow();

    expect(screen.getByText("Sediment PP")).toBeInTheDocument();
    expect(screen.getByText("Sediment (PP)")).toBeInTheDocument();
    expect(
      screen.getByText("Every 6 months · last changed 10 Jan 2026"),
    ).toBeInTheDocument();
  });

  it("shows the next due date and how late it is", async () => {
    await aRow();

    // 10 Jan + 6 months = 10 Jul, which is 66 days before 14 Sep.
    expect(screen.getByText("10 Jul 2026")).toBeInTheDocument();
    expect(screen.getByText("66 days overdue")).toBeInTheDocument();
  });

  it("mentions the system only when asked to", async () => {
    await aRow({ withSystem: true, showSystem: true });

    expect(
      screen.getByText(/last changed 10 Jan 2026 · Aquafilter RO-6/),
    ).toBeInTheDocument();
  });
});

describe("marking a cartridge replaced", () => {
  it("writes the change, moves the schedule and offers an undo", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { consumable } = await aRow();

    await user.click(screen.getByRole("button", { name: /mark replaced/i }));

    // The toast is the only undo path in the app, so it has to carry the action.
    expect(
      await screen.findByText("«Sediment PP» replaced on 14 Sep 2026."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();

    // And the write really happened, not just the optimistic UI.
    await waitFor(async () => {
      const [updated] = await app.caller.consumables.list();
      expect(updated?.lastChangedOn).toBe(TODAY);
    });
    expect(
      await app.caller.consumables.history({ id: consumable.id }),
    ).toHaveLength(2);
  });

  it("cannot be pressed twice while the write is running", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { consumable } = await aRow();

    const release = app.holdMutations();
    await user.click(screen.getByRole("button", { name: /mark replaced/i }));

    const button = screen.getByRole("button", { name: /mark replaced/i });
    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
    expect(button).toBeDisabled();

    release();
    expect(
      await screen.findByText("«Sediment PP» replaced on 14 Sep 2026."),
    ).toBeInTheDocument();
    expect(
      await app.caller.consumables.history({ id: consumable.id }),
    ).toHaveLength(2);
  });

  it("puts the schedule back when the undo is taken", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { consumable } = await aRow();

    await user.click(screen.getByRole("button", { name: /mark replaced/i }));
    await user.click(await screen.findByRole("button", { name: "Undo" }));

    expect(
      await screen.findByText("Reverted to the previous replacement date."),
    ).toBeInTheDocument();
    await waitFor(async () => {
      expect(
        await app.caller.consumables.history({ id: consumable.id }),
      ).toHaveLength(1);
    });
    const [reverted] = await app.caller.consumables.list();
    expect(reverted?.lastChangedOn).toBe("2026-01-10");
  });

  it("reports a rejected write instead of pretending it worked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { consumable } = await aRow();
    // Delete it behind the component's back, so the mutation hits NOT_FOUND.
    await app.caller.consumables.delete({ id: consumable.id });

    await user.click(screen.getByRole("button", { name: /mark replaced/i }));

    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });
});

/**
 * The word in front of the count declines with it in Ukrainian — «Кожен 1
 * місяць» but «Кожні 6 місяців» — so the row has to hand the count to the
 * summary message and not only to the interval phrase inside it. English
 * cannot catch a regression here: "every" is "every" either way.
 */
describe("in Ukrainian", () => {
  let uk: TestApp;

  beforeEach(async () => {
    uk = await setupApp({ locale: "uk" });
  });

  afterEach(() => uk.close());

  async function aUkrainianRow(intervalValue: number) {
    await uk.caller.consumables.create({
      type: "post_carbon",
      name: "Пост-вугільний",
      intervalValue,
      intervalUnit: "months",
      lastChangedOn: "2026-01-10",
    });

    const [consumable] = await uk.caller.consumables.list();
    if (!consumable) throw new Error("fixture did not create a consumable");

    uk.render(
      <ConsumableRow
        consumable={consumable}
        today={TODAY}
        systems={[]}
        showSystem={false}
      />,
    );
  }

  // Only the determiner and the count are asserted: the date half is
  // `useFormatDate()`'s Intl output and is not what this test is about.
  it("agrees «кожен» with an interval of one", async () => {
    await aUkrainianRow(1);

    expect(await screen.findByText(/^Кожен 1 місяць ·/)).toBeInTheDocument();
  });

  it("uses «кожні» for every other category", async () => {
    await aUkrainianRow(6);

    expect(await screen.findByText(/^Кожні 6 місяців ·/)).toBeInTheDocument();
  });
});
