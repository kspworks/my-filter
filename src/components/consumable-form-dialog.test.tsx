import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import { ConsumableFormDialog } from "~/components/consumable-form-dialog";
import {
  screen,
  setupApp,
  type TestApp,
  userEvent,
  waitFor,
} from "~/test-utils/render";

/**
 * The type and interval-unit pickers are Radix `Select`s and are exercised in
 * `e2e/interactions.spec.ts`; everything asserted here goes through the plain
 * inputs and the form's own defaults.
 */

const TODAY = "2026-09-14";

let app: TestApp;
let onOpenChange: Mock<(open: boolean) => void>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  app = await setupApp();
  onOpenChange = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  app.close();
});

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

describe("creating", () => {
  it("defaults to a six-month sediment cartridge changed today", async () => {
    app.render(<ConsumableFormDialog open onOpenChange={onOpenChange} />);

    expect(screen.getByLabelText("Interval value")).toHaveValue(6);
    expect(screen.getByLabelText("Installed / last changed")).toHaveValue(
      TODAY,
    );
  });

  it("writes an unassigned cartridge with its installation logged", async () => {
    const actor = user();
    app.render(<ConsumableFormDialog open onOpenChange={onOpenChange} />);

    await actor.type(screen.getByLabelText("Name"), "Sediment PP");
    await actor.click(screen.getByRole("button", { name: "Add consumable" }));

    expect(await screen.findByText("Consumable added.")).toBeInTheDocument();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    const [created] = await app.caller.consumables.list();
    expect(created).toMatchObject({
      name: "Sediment PP",
      type: "sediment",
      intervalValue: 6,
      intervalUnit: "months",
      systemId: null,
      lastChangedOn: TODAY,
    });
    expect(
      await app.caller.consumables.history({ id: created?.id ?? "" }),
    ).toHaveLength(1);
  });

  it("cannot be submitted twice while the write is running", async () => {
    const actor = user();
    app.render(<ConsumableFormDialog open onOpenChange={onOpenChange} />);

    await actor.type(screen.getByLabelText("Name"), "Sediment PP");
    const release = app.holdMutations();
    await actor.click(screen.getByRole("button", { name: "Add consumable" }));

    const submit = screen.getByRole("button", { name: "Add consumable" });
    await waitFor(() => expect(submit).toHaveAttribute("aria-busy", "true"));
    expect(submit).toBeDisabled();

    release();
    expect(await screen.findByText("Consumable added.")).toBeInTheDocument();
    expect(await app.caller.consumables.list()).toHaveLength(1);
  });

  it("attaches to the system it was opened for", async () => {
    const actor = user();
    const system = await app.caller.systems.create({
      manufacturer: "Aquafilter",
      model: "RO-6",
      installedOn: "2026-01-10",
    });

    app.render(
      <ConsumableFormDialog
        open
        onOpenChange={onOpenChange}
        defaultSystemId={system.id}
      />,
    );

    await actor.type(screen.getByLabelText("Name"), "Membrane");
    await actor.click(screen.getByRole("button", { name: "Add consumable" }));

    await screen.findByText("Consumable added.");
    const [created] = await app.caller.consumables.list();
    expect(created?.systemId).toBe(system.id);
  });

  it("never sends an out-of-range interval in the first place", async () => {
    const actor = user();
    app.render(<ConsumableFormDialog open onOpenChange={onOpenChange} />);

    await actor.type(screen.getByLabelText("Name"), "Sediment PP");
    await actor.clear(screen.getByLabelText("Interval value"));
    await actor.type(screen.getByLabelText("Interval value"), "9999");
    await actor.click(screen.getByRole("button", { name: "Add consumable" }));

    // `max={600}` on the input matches the router's `.max(600)`, so the browser
    // stops the submit and the round trip never happens.
    expect(await app.caller.consumables.list()).toEqual([]);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("turns a rejection the form cannot catch into an error toast", async () => {
    const actor = user();
    app.render(<ConsumableFormDialog open onOpenChange={onOpenChange} />);

    // `required` is satisfied by spaces, but the router trims before `.min(1)`.
    await actor.type(screen.getByLabelText("Name"), "   ");
    await actor.click(screen.getByRole("button", { name: "Add consumable" }));

    // `useErrorToast` recognises the flattened Zod error and shows the form
    // message rather than a raw server string.
    expect(
      await screen.findByText(
        "Please check the values in the form and try again.",
      ),
    ).toBeInTheDocument();
    expect(await app.caller.consumables.list()).toEqual([]);
  });
});

describe("editing", () => {
  it("hides the fields that only make sense when creating", async () => {
    const consumable = await app.caller.consumables.create({
      type: "membrane",
      name: "Membrane",
      intervalValue: 24,
      intervalUnit: "months",
      lastChangedOn: "2026-01-10",
    });

    app.render(
      <ConsumableFormDialog
        open
        onOpenChange={onOpenChange}
        consumable={consumable}
      />,
    );

    expect(screen.getByLabelText("Name")).toHaveValue("Membrane");
    expect(screen.getByLabelText("Interval value")).toHaveValue(24);
    // The date and the system are owned by `markReplaced` and `attach`.
    expect(
      screen.queryByLabelText("Installed / last changed"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("System")).not.toBeInTheDocument();
  });

  it("saves a rename without touching the schedule", async () => {
    const actor = user();
    const consumable = await app.caller.consumables.create({
      type: "membrane",
      name: "Membrane",
      intervalValue: 24,
      intervalUnit: "months",
      lastChangedOn: "2026-01-10",
    });

    app.render(
      <ConsumableFormDialog
        open
        onOpenChange={onOpenChange}
        consumable={consumable}
      />,
    );
    await actor.clear(screen.getByLabelText("Name"));
    await actor.type(screen.getByLabelText("Name"), "Membrane 50 GPD");
    await actor.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Consumable updated.")).toBeInTheDocument();
    const [updated] = await app.caller.consumables.list();
    expect(updated).toMatchObject({
      name: "Membrane 50 GPD",
      lastChangedOn: "2026-01-10",
    });
  });
});
