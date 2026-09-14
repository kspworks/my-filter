import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsumablesView } from "~/components/consumables-view";
import { screen, setupApp, type TestApp } from "~/test-utils/render";

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

async function cartridge(
  name: string,
  lastChangedOn: string,
  systemId?: string,
) {
  return app.caller.consumables.create({
    systemId,
    type: "sediment",
    name,
    intervalValue: 6,
    intervalUnit: "months",
    lastChangedOn,
  });
}

describe("empty", () => {
  it("explains both shelves", async () => {
    app.render(<ConsumablesView />);

    expect(
      await screen.findByText("Nothing attached to a system yet."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nothing on the shelf. Detached items show up here."),
    ).toBeInTheDocument();
  });
});

describe("split by attachment", () => {
  it("counts each section and puts cartridges in the right one", async () => {
    const system = await app.caller.systems.create({
      manufacturer: "Aquafilter",
      model: "RO-6",
      installedOn: "2026-01-10",
    });
    await cartridge("Attached one", "2026-01-10", system.id);
    await cartridge("Attached two", "2026-02-10", system.id);
    await cartridge("On the shelf", "2026-01-10");

    app.render(<ConsumablesView />);

    expect(await screen.findByText("Attached (2)")).toBeInTheDocument();
    expect(screen.getByText("Unassigned (1)")).toBeInTheDocument();
    expect(screen.getByText("On the shelf")).toBeInTheDocument();
  });

  it("orders each section most urgent first", async () => {
    const system = await app.caller.systems.create({
      manufacturer: "Aquafilter",
      model: "RO-6",
      installedOn: "2026-01-10",
    });
    await cartridge("Later", "2026-08-01", system.id);
    await cartridge("Sooner", "2025-06-01", system.id);

    const { container } = app.render(<ConsumablesView />);

    await screen.findByText("Sooner");
    const text = container.textContent ?? "";
    expect(text.indexOf("Sooner")).toBeLessThan(text.indexOf("Later"));
  });
});
