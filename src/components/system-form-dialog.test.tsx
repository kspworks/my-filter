import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import { SystemFormDialog } from "~/components/system-form-dialog";
import {
  screen,
  setupApp,
  type TestApp,
  userEvent,
  waitFor,
} from "~/test-utils/render";
import { routerMock } from "~/test-utils/stubs/next-navigation";

const TODAY = "2026-09-14";

let app: TestApp;
let onOpenChange: Mock<(open: boolean) => void>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  app = await setupApp();
  onOpenChange = vi.fn();
  routerMock.push.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  app.close();
});

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

describe("creating", () => {
  it("defaults the installation date to today", async () => {
    app.render(<SystemFormDialog open onOpenChange={onOpenChange} />);

    expect(screen.getByLabelText("Installation date")).toHaveValue(TODAY);
    expect(
      screen.getByRole("heading", { name: "Add system" }),
    ).toBeInTheDocument();
  });

  it("writes a real row, confirms it and closes", async () => {
    const actor = user();
    app.render(<SystemFormDialog open onOpenChange={onOpenChange} />);

    await actor.type(screen.getByLabelText("Manufacturer"), "  Aquafilter  ");
    await actor.type(screen.getByLabelText("Model"), "RO-6");
    await actor.click(screen.getByRole("button", { name: "Add system" }));

    expect(await screen.findByText("System added.")).toBeInTheDocument();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    const [created] = await app.caller.systems.list();
    // Trimmed on the way in, and an untouched notes field becomes null rather
    // than an empty string.
    expect(created).toMatchObject({
      manufacturer: "Aquafilter",
      model: "RO-6",
      installedOn: TODAY,
      notes: null,
    });
    // Lands on the new system, where its cartridges get added.
    await waitFor(() =>
      expect(routerMock.push).toHaveBeenCalledWith(`/systems/${created?.id}`),
    );
  });

  it("keeps the notes that were typed", async () => {
    const actor = user();
    app.render(<SystemFormDialog open onOpenChange={onOpenChange} />);

    await actor.type(screen.getByLabelText("Manufacturer"), "Aquafilter");
    await actor.type(screen.getByLabelText("Model"), "RO-6");
    await actor.type(screen.getByLabelText("Notes"), "Under the sink");
    await actor.click(screen.getByRole("button", { name: "Add system" }));

    await screen.findByText("System added.");
    const [created] = await app.caller.systems.list();
    expect(
      await app.caller.systems.byId({ id: created?.id ?? "" }),
    ).toMatchObject({ notes: "Under the sink" });
  });
});

describe("editing", () => {
  it("prefills from the system it was given and updates in place", async () => {
    const actor = user();
    const system = await app.caller.systems.create({
      manufacturer: "Aquafilter",
      model: "RO-6",
      installedOn: "2026-01-10",
      notes: "Kitchen",
    });

    app.render(
      <SystemFormDialog open onOpenChange={onOpenChange} system={system} />,
    );

    expect(screen.getByLabelText("Manufacturer")).toHaveValue("Aquafilter");
    expect(screen.getByLabelText("Installation date")).toHaveValue(
      "2026-01-10",
    );
    expect(
      screen.getByRole("heading", { name: "Edit system" }),
    ).toBeInTheDocument();

    await actor.clear(screen.getByLabelText("Model"));
    await actor.type(screen.getByLabelText("Model"), "RO-9");
    await actor.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("System updated.")).toBeInTheDocument();
    await waitFor(async () => {
      expect(await app.caller.systems.byId({ id: system.id })).toMatchObject({
        model: "RO-9",
      });
    });
    // Editing must not silently create a second system.
    expect(await app.caller.systems.list()).toHaveLength(1);
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("surfaces a rejected write as an error, not a success", async () => {
    const actor = user();
    const system = await app.caller.systems.create({
      manufacturer: "Aquafilter",
      model: "RO-6",
      installedOn: "2026-01-10",
    });
    await app.caller.systems.delete({ id: system.id });

    app.render(
      <SystemFormDialog open onOpenChange={onOpenChange} system={system} />,
    );
    await actor.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
