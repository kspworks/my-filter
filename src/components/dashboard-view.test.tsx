import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardView } from "~/components/dashboard-view";
import { screen, setupApp, type TestApp, waitFor } from "~/test-utils/render";

/**
 * The broadest test in the suite: one render drives react-query, the tRPC
 * local link, the real router, Drizzle, SQLite, next-intl and `due-date`
 * together. If an upgrade breaks any of them, it usually breaks here first.
 */

const TODAY = "2026-09-14";

let app: TestApp;

beforeEach(async () => {
  // Fake only `Date`, so react-query's timers and user-event still work. This
  // pins `useToday()`, which otherwise reads the real clock at mount.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  app = await setupApp();
});

afterEach(() => {
  vi.useRealTimers();
  app.close();
});

/** Interval of 6 months, so `lastChangedOn` places it relative to `TODAY`. */
async function addConsumable(
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

describe("empty state", () => {
  it("invites a first system and disables adding a cartridge", async () => {
    app.render(<DashboardView />);

    expect(await screen.findByText("Nothing tracked yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add consumable/i }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /add system/i })).toBeEnabled();
  });
});

describe("status tiles", () => {
  it("counts each due status once the query resolves", async () => {
    const system = await app.caller.systems.create({
      manufacturer: "Aquafilter",
      model: "RO-6",
      installedOn: "2024-01-01",
    });
    // 6-month interval against 2026-09-14:
    await addConsumable("Overdue one", "2026-01-01", system.id); // due 2026-07-01
    await addConsumable("Due soon one", "2026-03-20", system.id); // due 2026-09-20
    await addConsumable("Fine one", "2026-08-01", system.id); // due 2027-02-01

    app.render(<DashboardView />);

    // Every tile reads "—" until the list arrives.
    expect(screen.getAllByText("—")).toHaveLength(3);

    const tile = async (label: string) =>
      (await screen.findByText(label)).closest("div[data-slot='card']");

    await waitFor(async () => {
      expect(await tile("Overdue")).toHaveTextContent("1");
      expect(await tile("Due soon")).toHaveTextContent("1");
      expect(await tile("On schedule")).toHaveTextContent("1");
    });
  });
});

describe("grouping", () => {
  it("orders groups by urgency and always puts the spare shelf last", async () => {
    const urgent = await app.caller.systems.create({
      manufacturer: "Urgent",
      model: "Unit",
      installedOn: "2024-01-01",
    });
    const relaxed = await app.caller.systems.create({
      manufacturer: "Relaxed",
      model: "Unit",
      installedOn: "2024-01-01",
    });
    await addConsumable("Very overdue", "2025-01-01", urgent.id);
    await addConsumable("Comfortable", "2026-09-01", relaxed.id);
    // No systemId: lands on the spare shelf, and is the most overdue of all.
    await addConsumable("Spare", "2024-01-01");

    app.render(<DashboardView />);

    await screen.findByText("Urgent Unit");
    // Every group title is a link, and nothing else on the page is, so document
    // order here is exactly the group order.
    const titles = screen.getAllByRole("link").map((node) => node.textContent);

    expect(titles).toEqual(["Urgent Unit", "Relaxed Unit", "Unassigned"]);
  });

  it("sorts cartridges within a group most urgent first", async () => {
    const system = await app.caller.systems.create({
      manufacturer: "Aquafilter",
      model: "RO-6",
      installedOn: "2024-01-01",
    });
    await addConsumable("Later", "2026-08-01", system.id);
    await addConsumable("Sooner", "2025-06-01", system.id);

    const { container } = app.render(<DashboardView />);

    await screen.findByText("Sooner");
    const rendered = container.textContent ?? "";

    expect(rendered.indexOf("Sooner")).toBeLessThan(rendered.indexOf("Later"));
  });

  it("links a system group to its detail page and the shelf to consumables", async () => {
    const system = await app.caller.systems.create({
      manufacturer: "Aquafilter",
      model: "RO-6",
      installedOn: "2024-01-01",
    });
    await addConsumable("Attached", "2026-01-01", system.id);
    await addConsumable("Spare", "2026-01-01");

    app.render(<DashboardView />);

    expect(
      await screen.findByRole("link", { name: "Aquafilter RO-6" }),
    ).toHaveAttribute("href", `/systems/${system.id}`);
    expect(screen.getByRole("link", { name: "Unassigned" })).toHaveAttribute(
      "href",
      "/consumables",
    );
  });

  it("counts the cartridges in a group through the plural message", async () => {
    const system = await app.caller.systems.create({
      manufacturer: "Aquafilter",
      model: "RO-6",
      installedOn: "2024-01-01",
    });
    await addConsumable("Only one", "2026-01-01", system.id);

    app.render(<DashboardView />);

    expect(await screen.findByText("1 item")).toBeInTheDocument();
  });
});
