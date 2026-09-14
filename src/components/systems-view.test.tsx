import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SystemsView } from "~/components/systems-view";
import { screen, setupApp, type TestApp } from "~/test-utils/render";

let app: TestApp;

beforeEach(async () => {
  app = await setupApp();
});

afterEach(() => app.close());

describe("with nothing tracked", () => {
  it("offers a first system", async () => {
    app.render(<SystemsView />);

    expect(await screen.findByText("No systems yet")).toBeInTheDocument();
  });
});

describe("with systems", () => {
  it("links each one to its own page and counts its cartridges", async () => {
    const system = await app.caller.systems.create({
      manufacturer: "Aquafilter",
      model: "RO-6",
      installedOn: "2026-01-10",
    });
    await app.caller.systems.applyPreset({
      systemId: system.id,
      presetId: "prefilter_3_stage",
    });

    app.render(<SystemsView />);

    const link = await screen.findByRole("link", { name: /Aquafilter/ });
    expect(link).toHaveAttribute("href", `/systems/${system.id}`);
    expect(link).toHaveTextContent("Installed 10 Jan 2026");
    // Through the ICU plural, not a hand-built "3 consumables".
    expect(link).toHaveTextContent("3 consumables");
  });

  it("uses the singular for a system with one cartridge", async () => {
    const system = await app.caller.systems.create({
      manufacturer: "Barrier",
      model: "Profi",
      installedOn: "2026-01-10",
    });
    await app.caller.consumables.create({
      systemId: system.id,
      type: "sediment",
      name: "Sediment PP",
      intervalValue: 6,
      intervalUnit: "months",
      lastChangedOn: "2026-01-10",
    });

    app.render(<SystemsView />);

    expect(await screen.findByText("1 consumable")).toBeInTheDocument();
  });
});
