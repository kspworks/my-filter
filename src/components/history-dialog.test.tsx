import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HistoryDialog } from "~/components/history-dialog";
import { screen, setupApp, type TestApp, waitFor } from "~/test-utils/render";

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
