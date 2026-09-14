import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemDetailView } from "~/components/system-detail-view";
import { newId } from "~/server/db/id";
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

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  app = await setupApp();
});

afterEach(() => {
  vi.useRealTimers();
  app.close();
});

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

async function aSystem() {
  return app.caller.systems.create({
    manufacturer: "Aquafilter",
    model: "RO-6",
    installedOn: "2026-01-10",
    notes: "Under the sink",
  });
}

describe("when the system does not exist", () => {
  it("says so and offers a way back", async () => {
    app.render(<SystemDetailView systemId={newId()} />);

    expect(await screen.findByText("System not found")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to systems" }),
    ).toHaveAttribute("href", "/systems");
  });
});

describe("when it does", () => {
  it("shows the header, the installation date and the notes", async () => {
    const system = await aSystem();

    app.render(<SystemDetailView systemId={system.id} />);

    expect(
      await screen.findByRole("heading", { name: "Aquafilter RO-6" }),
    ).toBeInTheDocument();
    // Date and notes share one paragraph, joined by a separator.
    expect(
      screen.getByText("Installed 10 Jan 2026 · Under the sink"),
    ).toBeInTheDocument();
  });

  it("invites a standard set while there are no cartridges", async () => {
    const system = await aSystem();

    app.render(<SystemDetailView systemId={system.id} />);

    expect(
      await screen.findByText(/No cartridges tracked/),
    ).toBeInTheDocument();
    expect(screen.getByText("Consumables (0)")).toBeInTheDocument();
  });

  it("lists the cartridges it has, most urgent first", async () => {
    const system = await aSystem();
    await app.caller.systems.applyPreset({
      systemId: system.id,
      presetId: "prefilter_3_stage",
    });

    const { container } = app.render(<SystemDetailView systemId={system.id} />);

    expect(await screen.findByText("Consumables (3)")).toBeInTheDocument();
    // Shortest interval first: all three were installed the same day.
    const text = container.textContent ?? "";
    expect(text).toContain("Sediment");
  });
});

describe("deleting", () => {
  it("warns that the cartridges will be kept, and counts them", async () => {
    const actor = user();
    const system = await aSystem();
    await app.caller.systems.applyPreset({
      systemId: system.id,
      presetId: "prefilter_3_stage",
    });

    app.render(<SystemDetailView systemId={system.id} />);
    await screen.findByText("Consumables (3)");
    await actor.click(screen.getByRole("button", { name: "Delete system" }));

    expect(
      await screen.findByText(
        "Its 3 consumables will be kept and moved to Unassigned, along with their history.",
      ),
    ).toBeInTheDocument();
  });

  it("falls back to a plain warning when there is nothing to keep", async () => {
    const actor = user();
    const system = await aSystem();

    app.render(<SystemDetailView systemId={system.id} />);
    await screen.findByRole("heading", { name: "Aquafilter RO-6" });
    await actor.click(screen.getByRole("button", { name: "Delete system" }));

    expect(
      await screen.findByText("This cannot be undone."),
    ).toBeInTheDocument();
  });

  it("removes the system and navigates away once confirmed", async () => {
    const actor = user();
    const system = await aSystem();

    app.render(<SystemDetailView systemId={system.id} />);
    await screen.findByRole("heading", { name: "Aquafilter RO-6" });
    await actor.click(screen.getByRole("button", { name: "Delete system" }));
    await actor.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(routerMock.push).toHaveBeenCalledWith("/systems"),
    );
    expect(await app.caller.systems.list()).toEqual([]);
  });
});
