import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HistoryDialog } from "~/components/history-dialog";
import {
  screen,
  setupApp,
  type TestApp,
  userEvent,
  waitFor,
  within,
} from "~/test-utils/render";

/**
 * Which entry is the installation is a fact about position, not a label in the
 * database — the log deliberately stores no text. So the arithmetic that turns
 * an index into "Installed" / "Most recent" / "Replaced" is the thing to pin.
 */

let app: TestApp;

beforeEach(async () => {
  app = await setupApp();
});

afterEach(() => app.close());

async function aCartridgeWith(changes: string[]) {
  const consumable = await app.caller.consumables.create({
    type: "sediment",
    name: "Sediment PP",
    intervalValue: 6,
    intervalUnit: "months",
    lastChangedOn: "2026-01-10",
  });
  for (const changedOn of changes) {
    await app.caller.consumables.markReplaced({ id: consumable.id, changedOn });
  }
  return consumable;
}

function open(consumableId: string) {
  app.render(
    <HistoryDialog
      open
      onOpenChange={() => {}}
      consumableId={consumableId}
      consumableName="Sediment PP"
    />,
  );
}

describe("labelling by position", () => {
  it("calls a lone entry the installation", async () => {
    const consumable = await aCartridgeWith([]);

    open(consumable.id);

    expect(await screen.findByText("Installed")).toBeInTheDocument();
    expect(screen.queryByText("Most recent")).not.toBeInTheDocument();
  });

  it("splits two entries into most recent and installed", async () => {
    const consumable = await aCartridgeWith(["2026-07-01"]);

    open(consumable.id);

    expect(await screen.findByText("Most recent")).toBeInTheDocument();
    expect(screen.getByText("Installed")).toBeInTheDocument();
    expect(screen.queryByText("Replaced")).not.toBeInTheDocument();
  });

  it("calls everything in between a plain replacement", async () => {
    const consumable = await aCartridgeWith(["2026-04-01", "2026-07-01"]);

    open(consumable.id);

    expect(await screen.findByText("Most recent")).toBeInTheDocument();
    expect(screen.getByText("Replaced")).toBeInTheDocument();
    expect(screen.getByText("Installed")).toBeInTheDocument();
  });

  it("prefers the entry's own note over the positional label", async () => {
    const consumable = await app.caller.consumables.create({
      type: "sediment",
      name: "Sediment PP",
      intervalValue: 6,
      intervalUnit: "months",
      lastChangedOn: "2026-01-10",
    });
    await app.caller.consumables.markReplaced({
      id: consumable.id,
      changedOn: "2026-07-01",
      note: "water tasted off",
    });

    open(consumable.id);

    expect(await screen.findByText("water tasted off")).toBeInTheDocument();
    expect(screen.queryByText("Most recent")).not.toBeInTheDocument();
  });
});

describe("entries", () => {
  it("lists them newest first, formatted for the locale", async () => {
    const consumable = await aCartridgeWith(["2026-07-01"]);

    open(consumable.id);

    await screen.findByText("1 Jul 2026");
    const entries = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(entries?.[0]).toContain("1 Jul 2026");
    expect(entries?.[1]).toContain("10 Jan 2026");
  });
});

describe("correcting the log", () => {
  it("deletes an entry and moves the schedule back", async () => {
    const user = userEvent.setup();
    const consumable = await aCartridgeWith(["2026-07-01"]);

    open(consumable.id);

    await user.click(
      await screen.findByRole("button", {
        name: "Delete the entry from 1 Jul 2026",
      }),
    );
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("Delete the entry from 1 Jul 2026?");
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByText("Entry deleted. The schedule has been updated."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("1 Jul 2026")).not.toBeInTheDocument();
    });
    const [listed] = await app.caller.consumables.list();
    expect(listed?.lastChangedOn).toBe("2026-01-10");
  });

  it("leaves the entry alone when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const consumable = await aCartridgeWith(["2026-07-01"]);

    open(consumable.id);

    await user.click(
      await screen.findByRole("button", {
        name: "Delete the entry from 1 Jul 2026",
      }),
    );
    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(
      await app.caller.consumables.history({ id: consumable.id }),
    ).toHaveLength(2);
  });

  it("offers no way to delete the installation", async () => {
    const consumable = await aCartridgeWith(["2026-07-01"]);

    open(consumable.id);

    await screen.findByText("Installed");
    expect(
      screen.queryByRole("button", {
        name: "Delete the entry from 10 Jan 2026",
      }),
    ).not.toBeInTheDocument();
  });

  it("does not suggest a correction with nothing to correct", async () => {
    const consumable = await aCartridgeWith([]);

    open(consumable.id);

    await screen.findByText("Installed");
    expect(screen.queryByText(/by mistake/)).not.toBeInTheDocument();
  });
});

describe("when the history cannot be loaded", () => {
  it("says so rather than showing an empty log", async () => {
    const consumable = await aCartridgeWith(["2026-07-01"]);
    app.failQueries();

    open(consumable.id);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t load your data",
    );
  });
});

describe("while closed", () => {
  it("does not fetch the history", async () => {
    const consumable = await aCartridgeWith(["2026-07-01"]);

    app.render(
      <HistoryDialog
        open={false}
        onOpenChange={() => {}}
        consumableId={consumable.id}
        consumableName="Sediment PP"
      />,
    );

    // `enabled: open` keeps a closed dialog from querying; nothing in the cache
    // is the observable form of that.
    await waitFor(() => {
      expect(
        app.queryClient
          .getQueryCache()
          .getAll()
          .filter((entry) => entry.state.data !== undefined),
      ).toHaveLength(0);
    });
  });
});
