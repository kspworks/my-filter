import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import { PresetPicker } from "~/components/preset-picker";
import {
  screen,
  setupApp,
  type TestApp,
  userEvent,
  waitFor,
} from "~/test-utils/render";

let app: TestApp;
let onOpenChange: Mock<(open: boolean) => void>;
let systemId: string;

async function open(locale: "en" | "uk" = "en") {
  app = await setupApp({ locale });
  onOpenChange = vi.fn();
  const system = await app.caller.systems.create({
    manufacturer: "Aquafilter",
    model: "RO-6",
    installedOn: "2026-01-10",
  });
  systemId = system.id;
  app.render(
    <PresetPicker
      open
      onOpenChange={onOpenChange}
      systemId={systemId}
      installedOn={system.installedOn}
    />,
  );
  return userEvent.setup();
}

afterEach(() => app?.close());

describe("choosing a set", () => {
  it("lists each set with what it contains", async () => {
    await open();

    expect(await screen.findByText("Classic 5-stage RO")).toBeInTheDocument();
    expect(screen.getByText("6-stage RO with mineralizer")).toBeInTheDocument();
    expect(screen.getByText("3-stage pre-filter block")).toBeInTheDocument();
    // Item lines render name plus interval through one parameterized message;
    // the post-carbon polisher appears in both RO sets.
    expect(
      screen.getAllByText("Inline post carbon — every 6 months").length,
    ).toBe(2);
  });

  it("will not apply anything until a set is picked", async () => {
    const actor = await open();

    expect(screen.getByRole("button", { name: /Add set/ })).toBeDisabled();

    await actor.click(await screen.findByText("Classic 5-stage RO"));

    expect(screen.getByRole("button", { name: /Add set/ })).toBeEnabled();
  });

  it("defaults the date to the system's installation", async () => {
    await open();

    expect(
      await screen.findByLabelText("Installed / last changed"),
    ).toHaveValue("2026-01-10");
  });
});

describe("applying a set", () => {
  it("creates the cartridges and says how many", async () => {
    const actor = await open();

    await actor.click(await screen.findByText("3-stage pre-filter block"));
    await actor.click(screen.getByRole("button", { name: /Add set/ }));

    expect(await screen.findByText("Added 3 consumables.")).toBeInTheDocument();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    const created = await app.caller.consumables.list({ systemId });
    expect(created).toHaveLength(3);
    expect(created.every((item) => item.lastChangedOn === "2026-01-10")).toBe(
      true,
    );
  });

  it("honours a different date", async () => {
    const actor = await open();

    await actor.clear(await screen.findByLabelText("Installed / last changed"));
    await actor.type(
      screen.getByLabelText("Installed / last changed"),
      "2026-05-05",
    );
    await actor.click(screen.getByText("3-stage pre-filter block"));
    await actor.click(screen.getByRole("button", { name: /Add set/ }));

    await screen.findByText("Added 3 consumables.");
    const created = await app.caller.consumables.list({ systemId });
    expect(created.every((item) => item.lastChangedOn === "2026-05-05")).toBe(
      true,
    );
  });

  it("names the cartridges in the user's own language", async () => {
    const actor = await open("uk");

    await actor.click(
      await screen.findByText("3-ступеневий блок передфільтрів"),
    );
    await actor.click(screen.getByRole("button", { name: /Додати/ }));

    await waitFor(async () => {
      const created = await app.caller.consumables.list({ systemId });
      expect(created).toHaveLength(3);
      // Stored as ordinary user data, in Ukrainian, and never re-translated.
      expect(created.every((item) => /[Ѐ-ӿ]/.test(item.name))).toBe(true);
    });
  });
});
