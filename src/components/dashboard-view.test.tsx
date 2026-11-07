import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardView } from "~/components/dashboard-view";
import {
  screen,
  setupApp,
  type TestApp,
  userEvent,
  waitFor,
  within,
} from "~/test-utils/render";

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

async function addSystem(manufacturer: string, model: string) {
  return app.caller.systems.create({
    manufacturer,
    model,
    installedOn: "2024-01-01",
  });
}

describe("empty state", () => {
  it("invites a first system and disables adding a cartridge", async () => {
    app.render(<DashboardView />);

    expect(await screen.findByText("Nothing tracked yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add cartridge/i }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /add system/i })).toBeEnabled();
  });

  // The regression this file missed: a system with nothing attached used to
  // leave the dashboard claiming nothing was tracked at all.
  it("shows a system that has no cartridges instead of the empty state", async () => {
    await addSystem("Aquafilter", "RO-6");

    app.render(<DashboardView />);

    expect(await screen.findByText("Aquafilter RO-6")).toBeInTheDocument();
    expect(screen.queryByText("Nothing tracked yet")).not.toBeInTheDocument();
    // A system exists, so a cartridge can now be attached to something.
    expect(
      screen.getByRole("button", { name: /add cartridge/i }),
    ).toBeEnabled();
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

describe("needs attention", () => {
  it("lists what is due across every system, most urgent first", async () => {
    const first = await addSystem("Aquafilter", "RO-6");
    const second = await addSystem("Ecosoft", "P'URE");
    // Due in a few days, in the system that sorts first.
    await addConsumable("Soon", "2026-03-20", first.id);
    // Long overdue, in the system that sorts second.
    await addConsumable("Overdue", "2025-06-01", second.id);
    await addConsumable("Fine", "2026-09-01", first.id);

    const { container } = app.render(<DashboardView />);

    const heading = await screen.findByText("Needs attention");
    const list = heading.closest("div[data-slot='card']");
    expect(list).toHaveTextContent("Overdue");
    expect(list).toHaveTextContent("Soon");
    expect(list).not.toHaveTextContent("Fine");

    const rendered = container.textContent ?? "";
    expect(rendered.indexOf("Overdue")).toBeLessThan(rendered.indexOf("Soon"));
    expect(rendered.indexOf("Soon")).toBeLessThan(rendered.indexOf("Fine"));
  });

  it("says which system each cartridge belongs to", async () => {
    const system = await addSystem("Aquafilter", "RO-6");
    await addConsumable("Overdue", "2025-06-01", system.id);

    app.render(<DashboardView />);

    expect(await screen.findByText(/Aquafilter RO-6/)).toBeInTheDocument();
  });

  it("is not there when nothing is due", async () => {
    const system = await addSystem("Aquafilter", "RO-6");
    await addConsumable("Fine", "2026-09-01", system.id);

    app.render(<DashboardView />);

    await screen.findByText("Fine");
    expect(screen.queryByText("Needs attention")).not.toBeInTheDocument();
  });

  it("drops a system whose cartridges are all listed above", async () => {
    const system = await addSystem("Aquafilter", "RO-6");
    await addConsumable("Overdue", "2025-06-01", system.id);

    app.render(<DashboardView />);

    await screen.findByText("Needs attention");
    expect(
      screen.queryByRole("link", { name: "Aquafilter RO-6" }),
    ).not.toBeInTheDocument();
  });
});

describe("the status tiles as filters", () => {
  it("narrows the list to one status and back again", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const system = await addSystem("Aquafilter", "RO-6");
    await addConsumable("Overdue", "2025-06-01", system.id);
    await addConsumable("Fine", "2026-09-01", system.id);

    app.render(<DashboardView />);
    await screen.findByText("Fine");

    const tile = screen.getByRole("button", { name: /On schedule/ });
    await user.click(tile);

    expect(tile).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Overdue", { selector: "span" })).toBeNull();
    expect(screen.getByText("Fine")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show all" }));

    expect(await screen.findByText("Needs attention")).toBeInTheDocument();
    expect(tile).toHaveAttribute("aria-pressed", "false");
  });

  it("disables a tile with nothing behind it", async () => {
    const system = await addSystem("Aquafilter", "RO-6");
    await addConsumable("Fine", "2026-09-01", system.id);

    app.render(<DashboardView />);
    await screen.findByText("Fine");

    expect(screen.getByRole("button", { name: /Overdue/ })).toBeDisabled();
  });
});

describe("spares", () => {
  it("leaves them out of every count, however old they are", async () => {
    await addConsumable("Boxed", "2024-01-01");

    app.render(<DashboardView />);

    await screen.findByText("Boxed");
    expect(screen.getByRole("button", { name: /Overdue/ })).toHaveTextContent(
      "0",
    );
    expect(
      screen.getByRole("button", { name: /On schedule/ }),
    ).toHaveTextContent("0");
    expect(screen.queryByText("Needs attention")).not.toBeInTheDocument();
  });
});

describe("grouping", () => {
  it("orders systems and always puts the spare shelf last", async () => {
    const first = await addSystem("Aquafilter", "Unit");
    await addSystem("Bare", "Unit");
    await addSystem("Cupboard", "Unit");
    await addConsumable("Comfortable", "2026-09-01", first.id);
    await addConsumable("Spare", "2024-01-01");

    app.render(<DashboardView />);

    await screen.findByText("Aquafilter Unit");
    // The nav is not rendered here, so these are exactly the group titles.
    const titles = screen.getAllByRole("link").map((node) => node.textContent);

    // Empty groups keep the server's manufacturer order among themselves.
    expect(titles).toEqual([
      "Aquafilter Unit",
      "Bare Unit",
      "Cupboard Unit",
      "Spares",
    ]);
  });

  it("sorts cartridges within a group most urgent first", async () => {
    const system = await addSystem("Aquafilter", "RO-6");
    await addConsumable("Later", "2026-09-01", system.id);
    await addConsumable("Sooner", "2026-06-01", system.id);

    const { container } = app.render(<DashboardView />);

    await screen.findByText("Sooner");
    const rendered = container.textContent ?? "";

    expect(rendered.indexOf("Sooner")).toBeLessThan(rendered.indexOf("Later"));
  });

  it("links a system group to its detail page and the shelf to cartridges", async () => {
    const system = await addSystem("Aquafilter", "RO-6");
    await addConsumable("Attached", "2026-09-01", system.id);
    await addConsumable("Spare", "2026-01-01");

    app.render(<DashboardView />);

    expect(
      await screen.findByRole("link", { name: "Aquafilter RO-6" }),
    ).toHaveAttribute("href", `/systems/${system.id}`);
    expect(screen.getByRole("link", { name: "Spares" })).toHaveAttribute(
      "href",
      "/consumables",
    );
  });

  it("tells an empty system's group it has nothing attached", async () => {
    const system = await addSystem("Aquafilter", "RO-6");

    app.render(<DashboardView />);

    const group = (await screen.findByText("Aquafilter RO-6")).closest(
      "div[data-slot='card']",
    );

    expect(group).toHaveTextContent("0 cartridges");
    expect(group).toHaveTextContent(/No cartridges tracked yet/);
    expect(
      await screen.findByRole("link", { name: "Aquafilter RO-6" }),
    ).toHaveAttribute("href", `/systems/${system.id}`);
  });

  it("counts the cartridges in a group through the plural message", async () => {
    const system = await addSystem("Aquafilter", "RO-6");
    await addConsumable("Only one", "2026-09-01", system.id);

    app.render(<DashboardView />);

    expect(await screen.findByText("1 cartridge")).toBeInTheDocument();
  });
});

describe("when the data cannot be loaded", () => {
  it("reports the failure instead of an empty account", async () => {
    const user = userEvent.setup();
    await app.caller.consumables.create({
      type: "sediment",
      name: "Sediment PP",
      intervalValue: 6,
      intervalUnit: "months",
      lastChangedOn: "2026-01-10",
    });
    const restore = app.failQueries();

    app.render(<DashboardView />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn’t load your data");
    expect(screen.queryByText("Nothing tracked yet")).not.toBeInTheDocument();
    // "0 overdue" would be a claim the page cannot back up.
    expect(screen.getAllByText("—")).toHaveLength(3);

    restore();
    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Sediment PP")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
